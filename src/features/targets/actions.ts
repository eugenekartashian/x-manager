"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { errorMessage } from "@/features/posts/messages";
import { requireWorkspace } from "@/server/auth/session";
import { removeCreators, setCreatorStatus, tagCreators } from "@/server/services/creators";
import { addTargets, findTargetId, removeTarget, saveTargetNote } from "@/server/services/targets";

const MESSAGES: Record<string, string> = {
  nothing_to_add: "Paste at least one @handle.",
  too_many: "Add at most 100 accounts at a time.",
  list_full: "The target list is full — remove an account first.",
  feature_disabled: "Targets are not enabled for your account.",
};

const addSchema = z.object({ handles: z.string().max(10_000) });

export async function addTargetsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = addSchema.safeParse({ handles: formData.get("handles") ?? "" });
  if (!input.success) return { status: "error", message: MESSAGES.too_many ?? "" };

  const source = formData.get("source") === "IMPORT" ? "IMPORT" : "MANUAL";
  const result = await addTargets(workspace.id, input.data.handles, new Date(), source);
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
  redirect("/targets");
}

const noteSchema = z.object({ targetId: z.uuid(), note: z.string().max(1_000) });

export async function saveNoteAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = noteSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await saveTargetNote(workspace.id, input.data.targetId, input.data.note);
  revalidatePath("/targets");
}

const sharedSchema = z.object({ handle: z.string().regex(/^[A-Za-z0-9_]{1,15}$/) });

/** Quick add from a shared link (M3.5): adds one account, then opens its reply session. */
export async function addSharedTargetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = sharedSchema.safeParse({ handle: formData.get("handle") ?? "" });
  if (!input.success) return { status: "error", message: "No valid @username to add." };

  const result = await addTargets(workspace.id, input.data.handle, new Date(), "SHARE");
  if (!result.ok) {
    return { status: "error", message: MESSAGES[result.error] ?? errorMessage(result.error) };
  }
  if (result.data.notFound.length) {
    return { status: "error", message: `@${input.data.handle} was not found on X.` };
  }
  if (result.data.skippedSelf) {
    return { status: "error", message: "That's your own account." };
  }
  revalidatePath("/targets");
  const id = await findTargetId(workspace.id, input.data.handle);
  redirect(id ? `/targets/${id}` : "/targets");
}

const BULK_MESSAGES: Record<string, string> = {
  invalid_selection: "Select between 1 and 100 creators.",
  invalid_tag: "Tags: up to 24 letters, numbers, - or _.",
  invalid_status: "Pick a status.",
};

/** Status / tag / remove for the selected rows of the creators table (M7.1). */
export async function bulkCreatorsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const ids = formData.getAll("id").filter((value): value is string => typeof value === "string");
  const op = formData.get("op");
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  const result =
    op === "status"
      ? await setCreatorStatus(workspace.id, ids, text("status"))
      : op === "tag-add" || op === "tag-remove"
        ? await tagCreators(workspace.id, ids, text("tag"), op === "tag-add" ? "add" : "remove")
        : op === "remove"
          ? await removeCreators(workspace.id, ids)
          : null;
  revalidatePath("/targets");
  if (!result) return { status: "error", message: "Unknown action." };
  if (!result.ok) return { status: "error", message: BULK_MESSAGES[result.error] ?? "" };
  return { status: "success", message: "Saved." };
}

const labelSchema = z.object({ targetId: z.uuid(), tag: z.string().max(40) });

export async function removeLabelAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = labelSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await tagCreators(workspace.id, [input.data.targetId], input.data.tag, "remove");
  revalidatePath(`/targets/${input.data.targetId}`);
  revalidatePath("/targets");
}
