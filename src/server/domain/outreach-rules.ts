// Collab outreach rules (M7.2, D-033). Messages are drafted here and sent by the user in X.

export const MAX_MESSAGE_LENGTH = 1_000;
/** "Didn't send it?" can be undone this long after opening X. */
export const MESSAGE_UNDO_WINDOW_MS = 24 * 3_600_000;

/**
 * X's direct-message composer with the text prefilled for one recipient.
 * UNVERIFIED on the mobile app — the UI also offers "Copy text" + "Open profile".
 */
export function dmIntentUrl(recipientXUserId: string, text: string): string {
  const url = new URL("https://x.com/messages/compose");
  url.searchParams.set("recipient_id", recipientXUserId);
  url.searchParams.set("text", text);
  return url.toString();
}

/** Opening a message moves a creator to "Messaged" unless they're further along. */
export function statusAfterMessage<S extends string>(current: S): S | "CONTACTED" {
  return current === "REPOSTED" || current === "PARTNER" ? current : "CONTACTED";
}
