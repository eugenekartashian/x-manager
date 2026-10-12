import "server-only";
import { parsePostUrl } from "@/lib/post-url";
import { err, ok, type Result } from "@/lib/result";
import {
  MAX_BATCH_CHECKS,
  MAX_CHECK_COST_MICROS,
  REPOST_WAIT_MS,
  repostProofUrl,
  SEARCH_WINDOW_MS,
  USER_CHECKS_PER_DAY,
} from "@/server/domain/repost-check-rules";
import * as checks from "@/server/repositories/repost-checks";
import * as replies from "@/server/repositories/replies";
import { canSpend } from "@/server/services/budget";
import { getLimitsContext, recordFeatureUsage, usedToday } from "@/server/services/limits";
import { findCreatorRepost, type XActionError } from "@/server/services/x-api";

// "Did they repost my post?" (M7.3, D-033): per creator, only when the user clicks. One X
// recent-search query finds that creator's Repost/quote of the post linked in your last
// message — exact, ≤ $0.01. The app never reposts anything; "I reposted back" is manual.

export type CreatorCheck =
  { found: true; kind: "repost" | "quote"; url: string } | { found: false };

export type CheckError =
  XActionError | "not_found" | "no_promoted_post" | "budget_exceeded" | "daily_check_limit";

export async function checkCreatorRepost(
  workspaceId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<Result<CreatorCheck, CheckError>> {
  const target = await replies.findTarget(workspaceId, targetId);
  if (!target) return err("not_found");
  const promotion = await checks.latestPromotion(
    workspaceId,
    target.id,
    new Date(now.getTime() - SEARCH_WINDOW_MS),
  );
  const postId = promotion?.postUrl ? parsePostUrl(promotion.postUrl)?.postId : null;
  if (!postId) return err("no_promoted_post");

  const { limits, timezone } = await getLimitsContext(workspaceId);
  if (
    limits &&
    (await usedToday(workspaceId, "REPOST_CHECK", timezone, now)) >= USER_CHECKS_PER_DAY
  ) {
    return err("daily_check_limit");
  }
  if (!(await canSpend(workspaceId, MAX_CHECK_COST_MICROS, now))) return err("budget_exceeded");

  const result = await findCreatorRepost(workspaceId, target.xUserId, postId);
  if (!result.ok) return result;
  await recordFeatureUsage(workspaceId, "REPOST_CHECK", now, target.id);

  const hit = result.data.find((post) => post.kind === "repost") ?? result.data[0];
  if (!hit) return ok({ found: false });
  await checks.markCreatorReposted(
    workspaceId,
    target.id,
    hit.kind === "repost" ? "Repost found by check" : "Quote found by check",
    now,
    promotion?.postUrl ? repostProofUrl(hit, target.username, promotion.postUrl) : null,
  );
  return ok({
    found: true,
    kind: hit.kind,
    url: promotion?.postUrl
      ? repostProofUrl(hit, target.username, promotion.postUrl)
      : `https://x.com/${target.username}/status/${hit.id}`,
  });
}

export type BatchSummary = { checked: number; found: number; stoppedBy: CheckError | null };

/** "Check all waiting": the same exact check for each "Messaged" creator, on click only. */
export async function checkAllWaiting(
  workspaceId: string,
  now: Date = new Date(),
): Promise<BatchSummary> {
  const waiting = await checks.waitingCreators(workspaceId, MAX_BATCH_CHECKS);
  const summary: BatchSummary = { checked: 0, found: 0, stoppedBy: null };
  for (const creator of waiting) {
    const result = await checkCreatorRepost(workspaceId, creator.id, now);
    if (!result.ok) {
      if (result.error === "no_promoted_post") continue;
      summary.stoppedBy = result.error;
      break;
    }
    summary.checked += 1;
    if (result.data.found) summary.found += 1;
  }
  return summary;
}

export type RepostOverview = { waitingForThem: number; waitingForMe: number };

export async function getRepostOverview(workspaceId: string): Promise<RepostOverview> {
  const [waitingForThem, waitingForMe] = await Promise.all([
    checks.countWaitingForThem(workspaceId),
    checks.countWaitingForMe(workspaceId),
  ]);
  return { waitingForThem, waitingForMe };
}

export async function markRepostedBack(
  workspaceId: string,
  targetId: string,
  done: boolean,
  now: Date = new Date(),
): Promise<Result<null, "not_found">> {
  return (await checks.setRepostedBack(workspaceId, targetId, done ? now : null))
    ? ok(null)
    : err("not_found");
}

/**
 * The user saw the Repost in X themselves — marked without any X call (free). With
 * `alsoBack`, the user's Repost back is recorded too.
 */
export async function markRepostedByHand(
  workspaceId: string,
  targetId: string,
  alsoBack: boolean,
  now: Date = new Date(),
): Promise<Result<null, "not_found">> {
  const marked = await checks.markCreatorReposted(workspaceId, targetId, "Marked by you", now);
  if (!marked) return err("not_found");
  if (alsoBack) await checks.setRepostedBack(workspaceId, targetId, now);
  return ok(null);
}

/** Cron, free: creators messaged > 3 days ago without a repost become "No reply". */
export function expireStaleMessaged(now: Date = new Date()): Promise<number> {
  return checks.expireNoReply(new Date(now.getTime() - REPOST_WAIT_MS), now);
}

/** What "Check all waiting" may cost at most (superadmin display). */
export function maxBatchCostMicros(waiting: number): number {
  return Math.min(waiting, MAX_BATCH_CHECKS) * MAX_CHECK_COST_MICROS;
}

/** Link of the post sent to this creator in the last 7 days (what "Did they repost?" checks). */
export async function latestPromotedPostUrl(
  workspaceId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const promotion = await checks.latestPromotion(
    workspaceId,
    targetId,
    new Date(now.getTime() - SEARCH_WINDOW_MS),
  );
  return promotion?.postUrl ?? null;
}

/** Link where the user can see this creator's found Repost (null if marked by hand). */
export function repostProofFor(workspaceId: string, targetId: string): Promise<string | null> {
  return checks.latestRepostProof(workspaceId, targetId);
}
