"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { archiveTrackedLink, createTrackedLink } from "@/server/services/links";

const MESSAGES: Record<string, string> = {
  empty_label: "Give the link a name, e.g. “Bio” or “Post 13 Oct”.",
  invalid_destination: "Paste a full https:// link, e.g. your OnlyFans page.",
  too_many: "You have 200 links — archive some first.",
};

export type CreateLinkState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; url: string; label: string };

const createSchema = z.object({
  label: z.string().max(200),
  destination: z.string().max(1_000),
});

export async function createLinkAction(
  _prev: CreateLinkState,
  formData: FormData,
): Promise<CreateLinkState> {
  const { workspace } = await requireWorkspace();
  const input = createSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { status: "error", message: MESSAGES.invalid_destination ?? "" };
  const result = await createTrackedLink(workspace.id, input.data);
  revalidatePath("/links");
  return result.ok
    ? { status: "success", url: result.data.url, label: input.data.label.trim() }
    : { status: "error", message: MESSAGES[result.error] ?? "Something went wrong." };
}

export async function archiveLinkAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const id = z.uuid().safeParse(formData.get("linkId"));
  if (!id.success) return;
  await archiveTrackedLink(workspace.id, id.data);
  revalidatePath("/links");
}
