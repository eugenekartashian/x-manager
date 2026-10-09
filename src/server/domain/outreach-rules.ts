// Collab outreach rules (M7.2, D-033). Messages are drafted here and sent by the user in X.

export const MAX_MESSAGE_LENGTH = 1_000;
/** Daily message limit choices for the superadmin (default 30; owner raises it slowly). */
export const MESSAGE_LIMIT_OPTIONS = [10, 15, 20, 30, 40, 50] as const;

/** One bulk send (superadmin, D-035) messages at most this many creators. */
export const MAX_BULK_MESSAGES = 10;
/**
 * A bulk send stops after this many X refusals in a row: X limits messages to people you
 * aren't connected with (agency report 2026-10-10, ~50 — UNVERIFIED), so more would fail too.
 */
export const MAX_REFUSALS_IN_ROW = 3;
/** Bulk sends skip creators messaged more recently than this. */
export const RECONTACT_WAIT_MS = 7 * 24 * 3_600_000;
/** "Didn't send it?" can be undone this long after opening X. */
export const MESSAGE_UNDO_WINDOW_MS = 24 * 3_600_000;

/**
 * Direct link to the 1:1 chat with a creator (X Chat). X no longer prefills text from links
 * (the documented `messages/compose?…&text=` lands in the post composer first and drops the
 * text — verified 2026-10-09), so the app copies the message and the user pastes it.
 * The conversation id is both user ids, lower first.
 */
export function chatUrl(myXUserId: string | null, theirXUserId: string): string {
  if (!myXUserId) return `https://x.com/messages/compose?recipient_id=${theirXUserId}`;
  const [low, high] =
    BigInt(myXUserId) < BigInt(theirXUserId)
      ? [myXUserId, theirXUserId]
      : [theirXUserId, myXUserId];
  return `https://x.com/i/chat/${low}-${high}`;
}

/** Opening a message moves a creator to "Messaged" unless they're further along. */
export function statusAfterMessage<S extends string>(current: S): S | "CONTACTED" {
  return current === "REPOSTED" || current === "PARTNER" ? current : "CONTACTED";
}

/**
 * Phones: the X app's own link opens the 1:1 chat directly (verified on iPhone 2026-10-09;
 * the x.com chat links only reach the inbox there). `text` is passed in case the app fills it.
 */
export function appChatUrl(theirXUserId: string, text: string): string {
  return `twitter://messages/compose?recipient_id=${theirXUserId}&text=${encodeURIComponent(text)}`;
}

export type BulkSkipReason = "declined" | "recently_messaged";

/** Why a creator is left out of a bulk send, or null when they can be messaged. */
export function bulkSkipReason(
  creator: { status: string; lastContactAt: Date | null },
  now: Date,
): BulkSkipReason | null {
  if (creator.status === "DECLINED") return "declined";
  if (
    creator.lastContactAt &&
    now.getTime() - creator.lastContactAt.getTime() < RECONTACT_WAIT_MS
  ) {
    return "recently_messaged";
  }
  return null;
}

/** The message as sent: the post link is added at the end when the text doesn't have it. */
export function withPostLink(text: string, postUrl: string | null): string {
  const trimmed = text.trim();
  if (!postUrl) return trimmed;
  const postId = /status\/(\d+)/.exec(postUrl)?.[1] ?? postUrl;
  return trimmed.includes(postId) ? trimmed : `${trimmed}\n${postUrl}`;
}
