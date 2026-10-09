import "server-only";
import { logger } from "@/lib/logger";
import { parsePostUrl } from "@/lib/post-url";
import { err, ok, type Result } from "@/lib/result";
import {
  FIRST_CHECK_PAGES,
  isDailyCheckDue,
  MAX_REPOSTER_PAGES,
  mergeSeen,
  REPOST_WAIT_MS,
  REPOSTERS_PAGE_SIZE,
  scanReposterPage,
  type ScanState,
} from "@/server/domain/repost-check-rules";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import * as checks from "@/server/repositories/repost-checks";
import { findConnection } from "@/server/repositories/x-accounts";
import { canSpend } from "@/server/services/budget";
import { getLimitsContext, recordFeatureUsage, usedToday } from "@/server/services/limits";
import { fetchReposters, type XActionError } from "@/server/services/x-api";

// "Who reposted my post" (M7.3, D-033): one incremental check per promoted post — we pay only
// for reposters we haven't seen yet. The app never reposts anything here; it only updates
// statuses so the user can repost back in X by hand.

/** Users may press "Check now" this many times a day (the daily check is automatic). */
export const MANUAL_CHECKS_PER_DAY = 3;
const WORST_CASE_MICROS = MAX_REPOSTER_PAGES * REPOSTERS_PAGE_SIZE * X_PRICE_MICROS.userRead;

export type CheckSummary = {
  posts: number;
  checked: number;
  newReposters: number;
  matched: number;
};

/** Own posts that messaged creators were asked to share, with the creators still waiting. */
async function promotedPosts(workspaceId: string, now: Date): Promise<Map<string, Set<string>>> {
  const rows = await checks.pendingPromotions(
    workspaceId,
    new Date(now.getTime() - REPOST_WAIT_MS),
  );
  const byPost = new Map<string, Set<string>>();
  const usernames = new Map<string, string | null>();
  for (const row of rows) {
    const parsed = row.postUrl ? parsePostUrl(row.postUrl) : null;
    if (!parsed) continue;
    usernames.set(parsed.postId, parsed.username);
    byPost.set(parsed.postId, (byPost.get(parsed.postId) ?? new Set()).add(row.target.xUserId));
  }
  // Only the user's own posts are checked (a pasted link to someone else's post is skipped).
  const [own, connection] = await Promise.all([
    checks.ownPostIds(workspaceId, [...byPost.keys()]),
    findConnection(workspaceId),
  ]);
  const me = connection?.username.toLowerCase();
  for (const postId of byPost.keys()) {
    const username = usernames.get(postId)?.toLowerCase();
    if (!own.has(postId) && !(me && username === me)) byPost.delete(postId);
  }
  return byPost;
}

export async function runRepostChecks(
  workspaceId: string,
  options: { now?: Date; force?: boolean } = {},
): Promise<Result<CheckSummary, XActionError | "budget_exceeded">> {
  const now = options.now ?? new Date();
  const posts = await promotedPosts(workspaceId, now);
  const { timezone } = await getLimitsContext(workspaceId);
  const summary: CheckSummary = { posts: posts.size, checked: 0, newReposters: 0, matched: 0 };

  for (const postId of posts.keys()) {
    const previous = await checks.findCheck(workspaceId, postId);
    if (!options.force && !isDailyCheckDue(previous?.checkedAt ?? null, now, timezone)) continue;
    if (!(await canSpend(workspaceId, WORST_CASE_MICROS, now))) return err("budget_exceeded");

    const seen = new Set(previous?.seenIds ?? []);
    let state: ScanState = { fresh: [], knownRun: 0, stop: false };
    let token: string | undefined;
    const maxPages = previous ? MAX_REPOSTER_PAGES : FIRST_CHECK_PAGES;
    for (let page = 0; page < maxPages; page++) {
      const result = await fetchReposters(workspaceId, postId, {
        maxResults: REPOSTERS_PAGE_SIZE,
        paginationToken: token,
      });
      if (!result.ok) return result;
      state = scanReposterPage(
        result.data.users.map((user) => user.id),
        seen,
        state,
      );
      if (state.stop || !result.data.nextToken) break;
      token = result.data.nextToken;
    }

    await checks.saveCheck(
      workspaceId,
      postId,
      mergeSeen(state.fresh, previous?.seenIds ?? []),
      now,
    );
    summary.checked += 1;
    summary.newReposters += state.fresh.length;
    summary.matched += await checks.markReposted(workspaceId, state.fresh, now);
  }
  return ok(summary);
}

export type CheckNowError =
  XActionError | "budget_exceeded" | "daily_check_limit" | "nothing_to_check";

/** "Check now" from the Creators page (users: a few times a day). */
export async function checkRepostsNow(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Result<CheckSummary, CheckNowError>> {
  const { limits, timezone } = await getLimitsContext(workspaceId);
  if (
    limits &&
    (await usedToday(workspaceId, "REPOST_CHECK", timezone, now)) >= MANUAL_CHECKS_PER_DAY
  ) {
    return err("daily_check_limit");
  }
  const result = await runRepostChecks(workspaceId, { now, force: true });
  if (result.ok && result.data.posts === 0) return err("nothing_to_check");
  if (result.ok) await recordFeatureUsage(workspaceId, "REPOST_CHECK", now);
  return result;
}

export type RepostOverview = {
  waitingForThem: number;
  waitingForMe: number;
  lastCheckedAt: Date | null;
  /** Posts "Check now" would read, and the worst-case cost (micro-dollars). */
  postsToCheck: number;
  maxCostMicros: number;
};

export async function getRepostOverview(
  workspaceId: string,
  now: Date = new Date(),
): Promise<RepostOverview> {
  const [waitingForThem, waitingForMe, list, posts] = await Promise.all([
    checks.countWaitingForThem(workspaceId),
    checks.countWaitingForMe(workspaceId),
    checks.listChecks(workspaceId),
    promotedPosts(workspaceId, now),
  ]);
  const checked = new Set(list.map((row) => row.xPostId));
  const maxCostMicros = [...posts.keys()].reduce(
    (sum, postId) =>
      sum +
      (checked.has(postId) ? MAX_REPOSTER_PAGES : FIRST_CHECK_PAGES) *
        REPOSTERS_PAGE_SIZE *
        X_PRICE_MICROS.userRead,
    0,
  );
  return {
    waitingForThem,
    waitingForMe,
    lastCheckedAt: list[0]?.checkedAt ?? null,
    postsToCheck: posts.size,
    maxCostMicros,
  };
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
 * Cron (any trigger): checks each workspace's promoted posts once a day after 09:00 local, then turns
 * creators messaged > 3 days ago without a repost into "No reply".
 */
export async function runDailyRepostChecks(
  now: Date = new Date(),
): Promise<{ workspaces: number; matched: number; expired: number }> {
  const since = new Date(now.getTime() - REPOST_WAIT_MS);
  let matched = 0;
  const workspaceIds = await checks.workspacesWithPendingPromotions(since, 200);
  for (const workspaceId of workspaceIds) {
    try {
      const result = await runRepostChecks(workspaceId, { now });
      if (result.ok) matched += result.data.matched;
      else logger.warn("jobs.repost_check_failed", { workspaceId, error: result.error });
    } catch (error) {
      logger.error("jobs.repost_check_crashed", {
        workspaceId,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  const expired = await checks.expireNoReply(since, now);
  return { workspaces: workspaceIds.length, matched, expired };
}

/** Free: creators messaged > 3 days ago without a repost become "No reply". */
export function expireStaleMessaged(now: Date = new Date()): Promise<number> {
  return checks.expireNoReply(new Date(now.getTime() - REPOST_WAIT_MS), now);
}
