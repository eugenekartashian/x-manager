"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { errorMessage } from "@/features/posts/messages";
import { requireWorkspace } from "@/server/auth/session";
import {
  addTemplate,
  loadTargetPosts,
  openReply,
  removeTemplate,
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
