"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import {
  changeCreatorStatus,
  draftMessages,
  recordSentMessage,
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
