"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import {
  addPostToRotationByUrl,
  moveInRotation,
  refreshOwnPosts,
  setInRotation,
} from "@/server/services/own-posts";
import { errorMessage } from "./messages";

export type ActionState = { status: "idle" | "success" | "error"; message: string };

const done = (message: string): ActionState => ({ status: "success", message });
const failed = (code: string): ActionState => ({ status: "error", message: errorMessage(code) });

export async function refreshPostsAction(_prev: ActionState): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const result = await refreshOwnPosts(workspace.id);
  revalidatePath("/posts");
  return result.ok ? done(`Loaded ${result.data.synced} recent posts.`) : failed(result.error);
}

const addSchema = z.object({ url: z.string().trim().min(1).max(500) });

export async function addPostByUrlAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const input = addSchema.safeParse({ url: formData.get("url") });
  if (!input.success) return failed("invalid_url");
  const result = await addPostToRotationByUrl(workspace.id, input.data.url);
  revalidatePath("/posts");
  return result.ok ? done("Added to the repost list.") : failed(result.error);
}

const toggleSchema = z.object({ postId: z.uuid(), inRotation: z.enum(["true", "false"]) });

export async function toggleRotationAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await setInRotation(workspace.id, input.data.postId, input.data.inRotation === "true");
  revalidatePath("/posts");
}

const moveSchema = z.object({ postId: z.uuid(), direction: z.enum(["up", "down"]) });

export async function moveRotationAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const input = moveSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await moveInRotation(workspace.id, input.data.postId, input.data.direction);
  revalidatePath("/posts");
}
