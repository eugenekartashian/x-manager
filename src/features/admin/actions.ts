"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/features/posts/actions";
import { requireSuperadmin } from "@/server/auth/session";
import { inviteUser, revokeAccess } from "@/server/services/access";
import { approveRequest, dismissRequest } from "@/server/services/access-requests";
import { saveUserLimits } from "@/server/services/limits";
import { saveMessageLimit } from "@/server/services/outreach";

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

const limitsSchema = z.object({
  email: z.string().max(320),
  listPosts: z.coerce.number(),
  dailyTimes: z.coerce.number(),
  targets: z.coerce.number(),
  targetLoadsPerDay: z.coerce.number(),
  aiIdeasPerTargetPerDay: z.coerce.number(),
  budgetDollars: z.coerce.number(),
});

export async function saveLimitsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperadmin();
  const input = limitsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { status: "error", message: "Enter whole numbers in every field." };
  const { email, budgetDollars, ...numbers } = input.data;
  const result = await saveUserLimits(
    email,
    {
      ...numbers,
      targetsEnabled: formData.get("targetsEnabled") === "on",
      aiEnabled: formData.get("aiEnabled") === "on",
    },
    budgetDollars,
  );
  revalidatePath("/admin");
  if (result.ok) return { status: "success", message: "Limits saved — they apply right away." };
  return {
    status: "error",
    message:
      result.error === "invalid_limits"
        ? "Some values are out of range (see the hints) or the budget is not $1–$500."
        : "This user has no workspace yet — they need to sign in once.",
  };
}

const requestIdSchema = z.object({ requestId: z.uuid() });

export async function approveRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireSuperadmin();
  const input = requestIdSchema.safeParse(Object.fromEntries(formData));
  if (input.success) await approveRequest(input.data.requestId, user.id);
  revalidatePath("/admin");
}

export async function dismissRequestAction(formData: FormData): Promise<void> {
  await requireSuperadmin();
  const input = requestIdSchema.safeParse(Object.fromEntries(formData));
  if (input.success) await dismissRequest(input.data.requestId);
  revalidatePath("/admin");
}

/** The superadmin's own messages-per-day limit (manual + X API). */
export async function saveMessageLimitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireSuperadmin();
  const perDay = z.coerce.number().int().safeParse(formData.get("perDay"));
  const result = perDay.success ? await saveMessageLimit(workspace.id, perDay.data) : null;
  revalidatePath("/admin");
  revalidatePath("/targets", "layout");
  return result?.ok
    ? { status: "success", message: "Saved — applies right away." }
    : { status: "error", message: "Pick one of the listed limits." };
}
