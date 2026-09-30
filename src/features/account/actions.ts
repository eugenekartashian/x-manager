"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/features/posts/actions";
import { requireWorkspace } from "@/server/auth/session";
import { deleteMyAccount } from "@/server/services/account";

export async function deleteAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  if (formData.get("confirm") !== "DELETE") {
    return { status: "error", message: "Type DELETE to confirm." };
  }
  const result = await deleteMyAccount({
    id: user.id,
    email: user.email,
    workspaceId: workspace.id,
  });
  if (!result.ok) return { status: "error", message: "The owner account can't be deleted here." };
  // Sessions are gone with the user; the sign-in page confirms the deletion.
  redirect("/sign-in?deleted=1");
}
