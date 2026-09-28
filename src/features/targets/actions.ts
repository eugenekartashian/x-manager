"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { errorMessage } from "@/features/posts/messages";
import { requireWorkspace } from "@/server/auth/session";
import { addTargets, removeTarget, saveTargetNote } from "@/server/services/targets";

const MESSAGES: Record<string, string> = {
  nothing_to_add: "Paste at least one @handle.",
  too_many: "Add at most 100 accounts at a time.",
  list_full: "The target list is full (500 accounts).",
};

const addSchema = z.object({ handles: z.string().max(10_000) });

export async function addTargetsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = addSchema.safeParse({ handles: formData.get("handles") ?? "" });
  if (!input.success) return { status: "error", message: MESSAGES.too_many ?? "" };

  const result = await addTargets(workspace.id, input.data.handles);
  revalidatePath("/targets");
  if (!result.ok)
    return { status: "error", message: MESSAGES[result.error] ?? errorMessage(result.error) };

  const { added, alreadyInList, notFound, invalid, skippedSelf } = result.data;
  const parts = [
    added.length ? `Added ${added.length}` : "Nothing new added",
    alreadyInList.length ? `${alreadyInList.length} already in the list` : "",
    notFound.length ? `not found: ${notFound.map((name) => `@${name}`).join(", ")}` : "",
    invalid.length
      ? `invalid: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}`
      : "",
    skippedSelf ? "your own account was skipped" : "",
  ].filter(Boolean);
  return { status: added.length ? "success" : "error", message: `${parts.join(" · ")}.` };
}

const idSchema = z.object({ targetId: z.uuid() });

export async function removeTargetAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = idSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await removeTarget(workspace.id, input.data.targetId);
  revalidatePath("/targets");
}

const noteSchema = z.object({ targetId: z.uuid(), note: z.string().max(1_000) });

export async function saveNoteAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = noteSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await saveTargetNote(workspace.id, input.data.targetId, input.data.note);
  revalidatePath("/targets");
}
