"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { requireSuperadmin } from "@/server/auth/session";
import { inviteUser, revokeAccess } from "@/server/services/access";

const MESSAGES: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  already_superadmin: "This email is a superadmin — it always has access.",
  not_found: "No active invite for this email.",
  cannot_revoke_superadmin: "A superadmin cannot be revoked here.",
};

const emailSchema = z.string().max(320);

export async function inviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireSuperadmin();
  const email = emailSchema.safeParse(formData.get("email") ?? "");
  const result = email.success ? await inviteUser(user.id, email.data) : null;
  revalidatePath("/admin");
  if (!result?.ok)
    return { status: "error", message: MESSAGES[result?.error ?? "invalid_email"] ?? "" };
  return {
    status: "success",
    message: `Invited ${result.data.email}. They can now sign in with Google using this email.`,
  };
}

export async function revokeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperadmin();
  const email = emailSchema.safeParse(formData.get("email") ?? "");
  const result = email.success ? await revokeAccess(email.data) : null;
  revalidatePath("/admin");
  if (!result?.ok)
    return { status: "error", message: MESSAGES[result?.error ?? "not_found"] ?? "" };
  return { status: "success", message: "Access revoked." };
}
