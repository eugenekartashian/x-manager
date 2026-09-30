"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { errorMessage } from "@/features/posts/messages";
import { requireSuperadmin, requireWorkspace } from "@/server/auth/session";
import { suggestIdeasForPost } from "@/server/services/ai-replies";
import {
  addTemplate,
  loadTargetPosts,
  openReply,
  removeTemplate,
  saveReplyLimits,
  undoReply,
} from "@/server/services/replies";

const MESSAGES: Record<string, string> = {
  empty_text: "Write something first.",
  too_long: "Keep it under 280 characters.",
  too_many: "You can keep up to 50 templates.",
  too_soon: "Posts were loaded less than 10 minutes ago.",
  account_cooldown: "You already replied to this account in the last 24 hours.",
  daily_limit: "Daily limit reached (15 replies). Try again tomorrow.",
  not_found: "This post is no longer available — reload the posts.",
  feature_disabled: "Targets are not enabled for your account.",
  daily_load_limit: "Daily limit for loading posts reached. Try again tomorrow.",
};
const message = (code: string) => MESSAGES[code] ?? errorMessage(code);

// ─── Templates ───────────────────────────────────────────────────────────────

export async function addTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const text = z
    .string()
    .max(2_000)
    .safeParse(formData.get("text") ?? "");
  const result = text.success ? await addTemplate(workspace.id, text.data) : null;
  revalidatePath("/targets");
  if (!result) return { status: "error", message: message("too_long") };
  return result.ok
    ? { status: "success", message: "Template added." }
    : { status: "error", message: message(result.error) };
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const id = z.uuid().safeParse(formData.get("templateId"));
  if (!id.success) return;
  await removeTemplate(workspace.id, id.data);
  revalidatePath("/targets");
}

// ─── Session ─────────────────────────────────────────────────────────────────

export async function loadPostsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const id = z.uuid().safeParse(formData.get("targetId"));
  if (!id.success) return { status: "error", message: message("not_found") };
  const result = await loadTargetPosts(workspace.id, id.data);
  revalidatePath(`/targets/${id.data}`);
  if (result.ok && result.data.loaded === 0) {
    return { status: "success", message: "No new original posts — see below." };
  }
  return result.ok
    ? { status: "success", message: `Loaded ${result.data.loaded} latest posts.` }
    : { status: "error", message: message(result.error) };
}

const openSchema = z.object({
  targetId: z.uuid(),
  xPostId: z.string().regex(/^\d{1,19}$/),
  text: z.string().max(2_000),
});

export type OpenReplyResult = { ok: true; intentUrl: string } | { ok: false; message: string };

export async function openReplyAction(input: z.input<typeof openSchema>): Promise<OpenReplyResult> {
  const { workspace } = await requireWorkspace();
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: message("not_found") };
  const result = await openReply(workspace, parsed.data);
  revalidatePath(`/targets/${parsed.data.targetId}`);
  revalidatePath("/targets");
  return result.ok
    ? { ok: true, intentUrl: result.data.intentUrl }
    : { ok: false, message: message(result.error) };
}

export async function undoReplyAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const id = z.uuid().safeParse(formData.get("replyId"));
  if (!id.success) return;
  await undoReply(workspace.id, id.data);
  revalidatePath("/targets", "layout");
}

const limitsSchema = z.object({
  cooldownHours: z.coerce.number().int(),
  perDay: z.coerce.number().int(),
});

export async function saveReplyLimitsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Users get the default reply limits (D-027); only the superadmin can change them.
  const { workspace } = await requireSuperadmin();
  const input = limitsSchema.safeParse(Object.fromEntries(formData));
  const result = input.success ? await saveReplyLimits(workspace.id, input.data) : null;
  revalidatePath("/targets", "layout");
  return result?.ok
    ? { status: "success", message: "Reply limits saved." }
    : { status: "error", message: "Pick values from the lists." };
}

const aiSchema = z.object({ targetId: z.uuid(), xPostId: z.string().regex(/^\d{1,19}$/) });

const AI_MESSAGES: Record<string, string> = {
  ai_not_configured: "AI is not set up yet (no API key).",
  ai_disabled: "AI ideas are not enabled for your account.",
  ai_target_limit: "Daily limit of AI ideas for this account reached. Try again tomorrow.",
  not_found: "This post is no longer available — reload the posts.",
  budget_exceeded: "Monthly API budget reached — AI ideas are paused.",
  ai_daily_limit: "Daily AI limit reached (100). Try again tomorrow.",
  ai_declined: "The AI declined this post — write your own reply or use a template.",
  ai_unavailable: "AI did not respond. Please try again.",
};

export type AiIdeasResult = { ok: true; ideas: string[] } | { ok: false; message: string };

export async function aiIdeasAction(input: z.input<typeof aiSchema>): Promise<AiIdeasResult> {
  const { workspace } = await requireWorkspace();
  const parsed = aiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: AI_MESSAGES.not_found ?? "" };
  const result = await suggestIdeasForPost(workspace.id, parsed.data);
  revalidatePath("/", "layout"); // spend banner / history
  return result.ok
    ? { ok: true, ideas: result.data }
    : { ok: false, message: AI_MESSAGES[result.error] ?? "AI did not respond." };
}
