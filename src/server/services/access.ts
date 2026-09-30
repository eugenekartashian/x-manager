import "server-only";
import { z } from "zod";
import type { UserRole } from "@/generated/prisma/client";
import { isEmailAllowed, normalizeEmail } from "@/lib/allowlist";
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/result";
import * as access from "@/server/repositories/access";

// Who may use the app (D-025): superadmins from SUPERADMIN_EMAILS (bootstrap — the owner
// can never lock themselves out) plus everyone with an active invite in the database.

export function isSuperadminEmail(email: string): boolean {
  return isEmailAllowed(email, env.SUPERADMIN_EMAILS);
}

export async function hasAppAccess(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (isSuperadminEmail(email)) return true;
  return access.hasActiveInvite(normalizeEmail(email));
}

/**
 * Current role of a user who has access, or null when they have none.
 * SUPERADMIN mirrors SUPERADMIN_EMAILS: granted on match, taken away when removed.
 */
export async function resolveAccess(userId: string): Promise<{ role: UserRole } | null> {
  const user = await access.findUserAccess(userId);
  if (!user || !(await hasAppAccess(user.email))) return null;

  const expected: UserRole = isSuperadminEmail(user.email)
    ? "SUPERADMIN"
    : user.role === "SUPERADMIN"
      ? "USER"
      : user.role;
  if (expected !== user.role) await access.setUserRole(userId, expected);
  return { role: expected };
}

export type InviteError = "invalid_email" | "already_superadmin";

export async function inviteUser(
  invitedById: string,
  rawEmail: string,
): Promise<Result<{ email: string }, InviteError>> {
  const email = z.email().safeParse(normalizeEmail(rawEmail));
  if (!email.success) return err("invalid_email");
  if (isSuperadminEmail(email.data)) return err("already_superadmin");
  await access.upsertInvite(email.data, invitedById);
  return ok({ email: email.data });
}

export type RevokeError = "not_found" | "cannot_revoke_superadmin";

/** Revokes the invite, signs the user out and pauses their schedule. */
export async function revokeAccess(
  rawEmail: string,
  now: Date = new Date(),
): Promise<Result<null, RevokeError>> {
  const email = normalizeEmail(rawEmail);
  if (isSuperadminEmail(email)) return err("cannot_revoke_superadmin");
  if (!(await access.revokeInvite(email, now))) return err("not_found");
  await access.cutOffUserByEmail(email);
  return ok(null);
}
