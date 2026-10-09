// Reply assistant rules (D-020). Replies are posted by the user on x.com; these limits
// keep engagement non-spammy (unsolicited replies are a common spam signal on X).
// X publishes no exact thresholds — the defaults are our conservative recommendation
// and the user can change them.

export const REPLY_COOLDOWN_HOUR_OPTIONS = [6, 12, 24] as const;
export const REPLY_DAILY_LIMIT_OPTIONS = [10, 15, 20, 30, 50] as const;
export const DEFAULT_REPLY_LIMITS = { cooldownHours: 24, perDay: 15 } as const;

export type ReplyLimits = { cooldownHours: number; perDay: number };

/** X counts most characters as 1 and many emoji as 2 — this is a simple upper guard. */
export const MAX_REPLY_LENGTH = 280;
export const MAX_TEMPLATES = 50;
/** Show this many of the account's latest original posts… */
export const TARGET_POSTS_SHOWN = 3;
/** …out of this many fetched (replies and Reposts are filtered out, so fetch extra). */
export const TARGET_POSTS_FETCHED = 10;
/**
 * X filters Reposts/replies out of each page after picking it, so a creator who mostly
 * reposts can return empty pages. Keep paging (≤ this many pages) until enough originals —
 * empty pages bill nothing; stop once this many posts were billed.
 */
export const TARGET_POSTS_MAX_PAGES = 5;
export const TARGET_POSTS_MAX_BILLED = 20;
export const TARGET_POSTS_MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Replies get seen while a post is still being shown to people. X publishes no post
 * lifetime — 24 h is our heuristic, used only to label posts (they are never hidden).
 */
export const FRESH_POST_MAX_AGE_MS = 24 * 3_600_000;

export function isFreshPost(postedAt: Date, now: Date): boolean {
  return now.getTime() - postedAt.getTime() < FRESH_POST_MAX_AGE_MS;
}

export type ReplyBlock =
  { reason: "account_cooldown"; until: Date } | { reason: "daily_limit" } | null;

/** Why a new reply to this account would be blocked right now (null = allowed). */
export function replyBlock(input: {
  lastRepliedAt: Date | null;
  repliesToday: number;
  limits: ReplyLimits;
  now: Date;
}): ReplyBlock {
  if (input.repliesToday >= input.limits.perDay) return { reason: "daily_limit" };
  if (input.lastRepliedAt) {
    const until = new Date(input.lastRepliedAt.getTime() + input.limits.cooldownHours * 3_600_000);
    if (until > input.now) return { reason: "account_cooldown", until };
  }
  return null;
}

/**
 * X's composer with the reply prefilled. The intent cannot attach media — the user
 * adds photos/videos in X before posting.
 */
export function replyIntentUrl(xPostId: string, text: string): string {
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("in_reply_to", xPostId);
  url.searchParams.set("text", text);
  return url.toString();
}
