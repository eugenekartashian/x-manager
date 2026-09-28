// Reply assistant rules (D-020). Replies are posted by the user on x.com; these limits
// keep engagement non-spammy (unsolicited replies are a common spam signal on X).

export const REPLY_LIMITS = {
  perTargetMs: 24 * 60 * 60 * 1000, // 1 reply per account per 24 h
  perDay: 15, // replies per workspace-local day
} as const;

/** X counts most characters as 1 and many emoji as 2 — this is a simple upper guard. */
export const MAX_REPLY_LENGTH = 280;
export const MAX_TEMPLATES = 50;
export const TARGET_POSTS_PER_LOAD = 5;
export const TARGET_POSTS_MIN_INTERVAL_MS = 10 * 60 * 1000;

export type ReplyBlock =
  { reason: "account_cooldown"; until: Date } | { reason: "daily_limit" } | null;

/** Why a new reply to this account would be blocked right now (null = allowed). */
export function replyBlock(input: {
  lastRepliedAt: Date | null;
  repliesToday: number;
  now: Date;
}): ReplyBlock {
  if (input.repliesToday >= REPLY_LIMITS.perDay) return { reason: "daily_limit" };
  if (input.lastRepliedAt) {
    const until = new Date(input.lastRepliedAt.getTime() + REPLY_LIMITS.perTargetMs);
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
