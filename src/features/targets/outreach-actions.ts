"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import {
  checkAllWaiting,
  checkCreatorRepost,
  markRepostedBack,
} from "@/server/services/repost-checks";
import {
  changeCreatorStatus,
  draftMessages,
  recordSentMessage,
  sendBulkViaApi,
  sendMessageViaApi,
  undoOpenedMessage,
} from "@/server/services/outreach";

const MESSAGES: Record<string, string> = {
  not_found: "This creator is no longer in your list.",
  empty_text: "Write a message first.",
  too_long: "Keep the message under 1,000 characters.",
  invalid_post_url: "Paste a link to an X post, like https://x.com/you/status/123…",
  daily_limit: "Daily message limit reached. Try again tomorrow — it keeps your account safe.",
  ai_not_configured: "AI is not set up yet.",
  ai_disabled: "AI is not enabled for your account.",
  ai_target_limit: "Daily limit of AI drafts for this creator reached. Try again tomorrow.",
  budget_exceeded: "This month's usage limit is reached.",
  ai_declined: "The AI declined — write your own message.",
  ai_unavailable: "AI did not respond. Please try again.",
  declined: "Skipped — marked Declined.",
  recently_messaged: "Skipped — messaged in the last 7 days.",
  not_sent: "Not sent — the batch stopped earlier.",
  too_many: "At most 10 creators at once.",
  forbidden:
    "X refused the message — this person may not accept messages from you, or X needs to be reconnected with message permission.",
  needs_reconnect: "Reconnect your X account on the dashboard.",
  not_connected: "Connect your X account first.",
  rate_limited: "X rate limit reached — try again later.",
  no_credits: "X API credits are used up — top up in the X Developer Console.",
  unknown_outcome:
    "X did not confirm — the message may or may not have been sent. Check the chat in X before trying again.",
  x_unavailable: "X is not responding. Try again in a minute.",
};
const message = (code: string) => MESSAGES[code] ?? "Something went wrong.";

const sentSchema = z.object({
  targetId: z.uuid(),
  text: z.string().max(2_000),
  postUrl: z.string().max(300).optional(),
});

export type SentMessageResult = { ok: true; eventId: string } | { ok: false; message: string };

/** "Yes, sent" — the only moment a message is recorded (history, status, daily count). */
export async function recordSentAction(
  input: z.input<typeof sentSchema>,
): Promise<SentMessageResult> {
  const { workspace } = await requireWorkspace();
  const parsed = sentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: message("not_found") };
  const result = await recordSentMessage(workspace, parsed.data);
  revalidatePath(`/targets/${parsed.data.targetId}`);
  revalidatePath("/targets");
  return result.ok
    ? { ok: true, eventId: result.data.eventId }
    : { ok: false, message: message(result.error) };
}

/** "Send via X API": one click sends this one exact message (superadmin experiment, D-034). */
export async function sendViaApiAction(
  input: z.input<typeof sentSchema>,
): Promise<SentMessageResult> {
  const { workspace, role } = await requireWorkspace();
  if (role !== "SUPERADMIN") return { ok: false, message: message("not_found") };
  const parsed = sentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: message("not_found") };
  const result = await sendMessageViaApi(workspace, parsed.data);
  revalidatePath(`/targets/${parsed.data.targetId}`);
  revalidatePath("/targets");
  revalidatePath("/", "layout"); // spend
  return result.ok
    ? { ok: true, eventId: result.data.eventId }
    : { ok: false, message: message(result.error) };
}

export async function undoMessageAction(input: {
  eventId: string;
  targetId: string;
}): Promise<boolean> {
  const { workspace } = await requireWorkspace();
  const parsed = z.object({ eventId: z.uuid(), targetId: z.uuid() }).safeParse(input);
  if (!parsed.success) return false;
  const result = await undoOpenedMessage(workspace.id, parsed.data.eventId);
  revalidatePath(`/targets/${parsed.data.targetId}`);
  revalidatePath("/targets");
  return result.ok;
}

const draftSchema = z.object({ targetId: z.uuid(), postUrl: z.string().max(300).optional() });

export type DraftResult = { ok: true; drafts: string[] } | { ok: false; message: string };

export async function draftMessagesAction(
  input: z.input<typeof draftSchema>,
): Promise<DraftResult> {
  const { workspace } = await requireWorkspace();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: message("not_found") };
  const result = await draftMessages(workspace, parsed.data);
  revalidatePath("/", "layout"); // spend / usage
  return result.ok
    ? { ok: true, drafts: result.data }
    : { ok: false, message: message(result.error) };
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const parsed = z
    .object({ targetId: z.uuid(), status: z.string().max(20) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await changeCreatorStatus(workspace.id, parsed.data.targetId, parsed.data.status);
  revalidatePath(`/targets/${parsed.data.targetId}`);
  revalidatePath("/targets");
}

const CHECK_MESSAGES: Record<string, string> = {
  not_found: "This creator is no longer in your list.",
  no_promoted_post: "Send them a message with one of your posts first (last 7 days).",
  daily_check_limit: "Daily limit of checks reached. Try again tomorrow.",
  budget_exceeded: "This month's usage limit is reached.",
  rate_limited: "X is busy right now — try again in a few minutes.",
};
const checkMessage = (code: string) => CHECK_MESSAGES[code] ?? "Check failed. Try again later.";

export type CreatorCheckResult =
  | { ok: true; found: boolean; url?: string; kind?: "repost" | "quote" }
  | { ok: false; message: string };

/** "Did @x repost?" — one exact X search for that creator (≤ $0.01). */
export async function checkCreatorAction(targetId: string): Promise<CreatorCheckResult> {
  const { workspace } = await requireWorkspace();
  if (!z.uuid().safeParse(targetId).success)
    return { ok: false, message: checkMessage("not_found") };
  const result = await checkCreatorRepost(workspace.id, targetId);
  revalidatePath(`/targets/${targetId}`);
  revalidatePath("/targets");
  if (!result.ok) return { ok: false, message: checkMessage(result.error) };
  return result.data.found
    ? { ok: true, found: true, url: result.data.url, kind: result.data.kind }
    : { ok: true, found: false };
}

export async function checkAllWaitingAction(): Promise<{ ok: boolean; message: string }> {
  const { workspace } = await requireWorkspace();
  const summary = await checkAllWaiting(workspace.id);
  revalidatePath("/targets", "layout");
  const base =
    summary.checked === 0
      ? "Nobody to check — message creators with one of your posts first."
      : `Checked ${summary.checked}: ${summary.found} reposted ✓`;
  return summary.stoppedBy
    ? { ok: summary.checked > 0, message: `${base}. Stopped: ${checkMessage(summary.stoppedBy)}` }
    : { ok: true, message: base };
}

export async function repostedBackAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const parsed = z
    .object({ targetId: z.uuid(), done: z.enum(["1", "0"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await markRepostedBack(workspace.id, parsed.data.targetId, parsed.data.done === "1");
  revalidatePath(`/targets/${parsed.data.targetId}`);
  revalidatePath("/targets");
}

const bulkDraftSchema = z.object({
  targetIds: z.array(z.uuid()).min(1).max(10),
  postUrl: z.string().max(300).optional(),
});

export type BulkDraft = { targetId: string; text: string | null; error: string | null };

/** One AI message per selected creator, drafted in parallel (superadmin, D-035). */
export async function draftBulkAction(
  input: z.input<typeof bulkDraftSchema>,
): Promise<BulkDraft[]> {
  const { workspace, role } = await requireWorkspace();
  const parsed = bulkDraftSchema.safeParse(input);
  if (role !== "SUPERADMIN" || !parsed.success) return [];
  const { targetIds, postUrl } = parsed.data;
  const drafts = await Promise.all(
    targetIds.map(async (targetId): Promise<BulkDraft> => {
      const result = await draftMessages(workspace, { targetId, ...(postUrl ? { postUrl } : {}) });
      return result.ok
        ? { targetId, text: result.data[0] ?? "", error: null }
        : { targetId, text: null, error: message(result.error) };
    }),
  );
  revalidatePath("/", "layout"); // spend
  return drafts;
}

const bulkSendSchema = z.object({
  items: z
    .array(z.object({ targetId: z.uuid(), text: z.string().max(2_000) }))
    .min(1)
    .max(10),
  postUrl: z.string().max(300).optional(),
});

export type BulkSendResult =
  | { ok: true; results: { targetId: string; ok: boolean; message: string | null }[] }
  | { ok: false; message: string };

/** "Send all": the reviewed messages go out one after another via the X API (D-035). */
export async function sendBulkAction(
  input: z.input<typeof bulkSendSchema>,
): Promise<BulkSendResult> {
  const { workspace, role } = await requireWorkspace();
  if (role !== "SUPERADMIN") return { ok: false, message: message("not_found") };
  const parsed = bulkSendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: message("too_many") };
  const result = await sendBulkViaApi(workspace, parsed.data);
  revalidatePath("/targets");
  revalidatePath("/", "layout");
  if (!result.ok) return { ok: false, message: message(result.error) };
  return {
    ok: true,
    results: result.data.map((item) => ({
      targetId: item.targetId,
      ok: item.ok,
      message: item.ok ? null : message(item.error),
    })),
  };
}
