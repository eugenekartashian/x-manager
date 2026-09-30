import "server-only";
import type { OwnPost, ScheduledRepost } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { Result } from "@/lib/result";
import { prisma } from "@/server/db";
import { planReposts, type PlannedRepost, type PlanPost } from "@/server/domain/repost-plan";
import { REPOST_PAIR_COST_MICROS } from "@/server/domain/repost-rules";
import { capToLimits, effectiveIntervalMinutes } from "@/server/domain/user-limits";
import * as ownPosts from "@/server/repositories/own-posts";
import * as runs from "@/server/repositories/repost-runs";
import { canSpend } from "@/server/services/budget";
import { getLimits } from "@/server/services/limits";
import {
  connectedXUserId,
  repostPost,
  undoRepostPost,
  type XActionError,
} from "@/server/services/x-api";

// Executes due Reposts. Trigger-agnostic: called by the cron endpoint, a dev script or tests.
// Invariants: each slot occurrence runs at most once (unique dedupe key); one worker per
// workspace at a time (lease); ambiguous writes are re-checked once, never blind-retried.

/** How late an occurrence may still run (scheduler runs every ~5 min). */
export const GRACE_MS = 30 * 60_000;
export const LEASE_MS = 2 * 60_000;
/** Safety bound on planned items handled per workspace in one invocation. */
const MAX_ITEMS_PER_WORKSPACE = 60;
/** Stop starting new Reposts after this long; the next scheduler call continues. */
const DEFAULT_TIME_BUDGET_MS = 45_000;
/** Pause between Reposts of one batch, like manual clicks. */
const DEFAULT_PAUSE_BETWEEN_MS = 1_500;

export type JobOptions = {
  writesEnabled: boolean;
  batchSize?: number;
  pauseBetweenMs?: number;
  timeBudgetMs?: number;
};
export type JobSummary = {
  workspaces: number;
  succeeded: number;
  skipped: number;
  failed: number;
  unknown: number;
  recovered: number;
};

export async function processDueReposts(now: Date, options: JobOptions): Promise<JobSummary> {
  const summary: JobSummary = {
    workspaces: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    unknown: 0,
    recovered: 0,
  };
  const batchSize = options.batchSize ?? 20;

  for (const run of await runs.claimStaleRuns(now, LEASE_MS, batchSize)) {
    await recoverRun(run, now, options, summary);
  }

  for (const workspaceId of await runs.listSchedulableWorkspaceIds(batchSize)) {
    if (!(await runs.claimWorkspace(workspaceId, now, LEASE_MS))) continue;
    summary.workspaces++;
    try {
      await processWorkspace(workspaceId, now, options, summary);
    } catch (error) {
      logger.error("jobs.workspace_failed", {
        workspaceId,
        error: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      await runs.releaseWorkspace(workspaceId);
    }
  }

  logger.info("jobs.reposts_done", { ...summary, writesEnabled: options.writesEnabled });
  return summary;
}

// ─── Per workspace ───────────────────────────────────────────────────────────

async function processWorkspace(
  workspaceId: string,
  now: Date,
  options: JobOptions,
  summary: JobSummary,
) {
  const from = new Date(now.getTime() - GRACE_MS);
  const to = new Date(now.getTime() + 1); // include occurrences due exactly now

  const startedAt = Date.now();
  const timeBudget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const pause = options.pauseBetweenMs ?? DEFAULT_PAUSE_BETWEEN_MS;
  let previousWroteToX = false;

  // Re-plan after each Repost: its outcome changes the state the next one depends on.
  for (let step = 0; step < MAX_ITEMS_PER_WORKSPACE; step++) {
    if (Date.now() - startedAt > timeBudget) return; // the rest runs on the next call
    const context = await loadContext(workspaceId);
    if (!context) return;
    const item = planReposts({
      ...context.planInput,
      from,
      to,
      skipKeys: await runs.recordedKeys(workspaceId, from),
    })[0];
    if (!item) return;
    if (previousWroteToX && !item.skipReason && pause > 0) await sleep(pause);
    const writesBefore = summary.succeeded + summary.failed + summary.unknown;
    await executeOccurrence(workspaceId, item, context, now, options, summary);
    previousWroteToX = summary.succeeded + summary.failed + summary.unknown > writesBefore;
  }
}

type Context = {
  connected: boolean;
  postsById: Map<string, OwnPost>;
  xUserId: string | null;
  planInput: Omit<Parameters<typeof planReposts>[0], "from" | "to" | "skipKeys">;
};

async function loadContext(workspaceId: string): Promise<Context | null> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { perPostMinIntervalMinutes: true },
  });
  const schedule = await prisma.repostSchedule.findUnique({
    where: { workspaceId },
    include: { slots: true },
  });
  if (!schedule?.active) return null;

  const xUserId = await connectedXUserId(workspaceId);
  const scope = xUserId.ok ? { workspaceId, xUserId: xUserId.data } : null;
  // Posts/times beyond the owner's limits never run, even if added before a limit was lowered.
  const limits = await getLimits(workspaceId);
  const { list, slots } = capToLimits(
    scope ? await ownPosts.listRotation(scope) : [],
    schedule.slots,
    limits,
  );
  const postsById = new Map(list.map((post) => [post.id, post]));
  const toPlanPost = (post: OwnPost): PlanPost => ({
    id: post.id,
    lastRepostedAt: post.lastRepostedAt,
  });

  return {
    connected: scope !== null,
    postsById,
    xUserId: scope?.xUserId ?? null,
    planInput: {
      schedule,
      // Every time reposts the whole list (D-017); no daily cap beyond 8 times (D-018).
      slots: slots.map((slot) => ({
        id: slot.id,
        localTime: slot.localTime,
        timezone: slot.timezone,
      })),
      list: list.map(toPlanPost),
      limits: {
        minIntervalMs:
          effectiveIntervalMinutes(workspace.perPostMinIntervalMinutes, limits) * 60_000,
      },
    },
  };
}

// ─── One occurrence ──────────────────────────────────────────────────────────

async function executeOccurrence(
  workspaceId: string,
  item: PlannedRepost,
  context: Context,
  now: Date,
  options: JobOptions,
  summary: JobSummary,
) {
  const post = item.postId ? (context.postsById.get(item.postId) ?? null) : null;
  const skipReason = !context.connected ? "not_connected" : item.skipReason;

  const run = await runs.insertRun({
    workspaceId,
    slotId: item.slotId,
    dedupeKey: item.key,
    runAt: item.runAt,
    localDate: item.localDate,
    ownPostId: post?.id ?? null,
    xPostId: post?.xPostId ?? null,
    fromList: true,
    status: skipReason ? "SKIPPED" : "PROCESSING",
    skipReason,
    leaseUntil: skipReason ? null : new Date(now.getTime() + LEASE_MS),
    finishedAt: skipReason ? now : null,
  });
  if (!run) return; // another worker owns this occurrence
  if (skipReason) {
    summary.skipped++;
    return;
  }

  const skip = async (reason: string) => {
    await runs.finishRun(run.id, { status: "SKIPPED", skipReason: reason, finishedAt: now });
    summary.skipped++;
  };
  if (!post) return skip("no_post");
  if (!options.writesEnabled) return skip("dry_run");
  if (!(await canSpend(workspaceId, REPOST_PAIR_COST_MICROS, now))) return skip("budget_exceeded");

  // Undo first so the Repost shows up again at the top of followers' timelines.
  const undo = await attempt(run, "UNDO", () => undoRepostPost(workspaceId, post.xPostId));
  if (!undo.ok && undo.error !== "unknown_outcome")
    return fail(run, undo.error, now, summary, post);

  let result = await attempt(run, "REPOST", () => repostPost(workspaceId, post.xPostId));
  if (!result.ok && result.error === "unknown_outcome") {
    // Safe to repeat once: X refuses a double Repost, so "already reposted" = done (D-007).
    result = await attempt(run, "RECHECK", () => repostPost(workspaceId, post.xPostId));
  }
  await settle(run, result, now, summary, post);
}

/** A run left PROCESSING by a crashed worker: only re-check the Repost (no undo). */
async function recoverRun(
  run: ScheduledRepost,
  now: Date,
  options: JobOptions,
  summary: JobSummary,
) {
  summary.recovered++;
  if (!options.writesEnabled || !run.xPostId) {
    await runs.finishRepost(run, "UNKNOWN", now, "interrupted");
    summary.unknown++;
    return;
  }
  const xPostId = run.xPostId;
  const result = await attempt(run, "RECHECK", () => repostPost(run.workspaceId, xPostId));
  await settle(run, result, now, summary, null);
}

async function settle(
  run: ScheduledRepost,
  result: Result<unknown, XActionError>,
  now: Date,
  summary: JobSummary,
  post: OwnPost | null,
) {
  if (result.ok) {
    await runs.finishRepost(run, "SUCCEEDED", now);
    summary.succeeded++;
  } else if (result.error === "unknown_outcome") {
    // Treated as done for limits (it may have happened); shown for a manual check.
    await runs.finishRepost(run, "UNKNOWN", now, "unknown_outcome");
    summary.unknown++;
  } else {
    await fail(run, result.error, now, summary, post);
  }
}

async function fail(
  run: ScheduledRepost,
  error: XActionError,
  now: Date,
  summary: JobSummary,
  post: OwnPost | null,
) {
  if (error === "not_connected" || error === "needs_reconnect") {
    await runs.finishRun(run.id, { status: "SKIPPED", skipReason: error, finishedAt: now });
    summary.skipped++;
    return;
  }
  await runs.finishRun(run.id, { status: "FAILED", errorCode: error, finishedAt: now });
  summary.failed++;
  // A deleted post would fail every time — take it out of the list.
  if (error === "not_found" && post) {
    await ownPosts.removeFromRotation(
      { workspaceId: run.workspaceId, xUserId: post.xUserId },
      post.id,
    );
    logger.warn("jobs.post_removed_from_list", { workspaceId: run.workspaceId });
  }
}

async function attempt<T>(
  run: ScheduledRepost,
  step: "UNDO" | "REPOST" | "RECHECK",
  call: () => Promise<Result<T, XActionError>>,
): Promise<Result<T, XActionError>> {
  const startedAt = new Date();
  const result = await call();
  await runs.recordAttempt({
    scheduledRepostId: run.id,
    workspaceId: run.workspaceId,
    step,
    outcome: result.ok ? String(result.data) : result.error,
    startedAt,
    finishedAt: new Date(),
  });
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
