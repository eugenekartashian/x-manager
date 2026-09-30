import "server-only";
import { normalizeEmail } from "@/lib/allowlist";
import { err, ok, type Result } from "@/lib/result";
import { deleteUserAndData } from "@/server/repositories/account";
import { isSuperadminEmail } from "@/server/services/access";
import { disconnectX } from "@/server/services/x-connection";

// "Delete my account and data" (M6.5, GDPR right to erasure).

export async function deleteMyAccount(user: {
  id: string;
  email: string;
  workspaceId: string;
}): Promise<Result<null, "superadmin">> {
  // The owner would be re-created on the next sign-in; guard against locking out the app.
  if (isSuperadminEmail(user.email)) return err("superadmin");
  // Revoke at X first (needs the stored refresh token), then delete everything locally.
  await disconnectX(user.workspaceId);
  await deleteUserAndData(user.id, normalizeEmail(user.email));
  return ok(null);
}
