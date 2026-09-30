import { requireSuperadmin } from "@/server/auth/session";

// Superadmin-only: throws on purpose so the owner can check that Sentry receives errors.
export async function GET() {
  await requireSuperadmin();
  throw new Error("Sentry test error (triggered from /admin)");
}
