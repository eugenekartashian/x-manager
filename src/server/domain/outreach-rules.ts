// Collab outreach rules (M7.2, D-033). Messages are drafted here and sent by the user in X.

export const MAX_MESSAGE_LENGTH = 1_000;
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
