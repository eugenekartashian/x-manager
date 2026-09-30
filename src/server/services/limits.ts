import "server-only";
import type { FeatureKind } from "@/generated/prisma/client";
import { localDateOf, zonedToUtc } from "@/lib/zoned-time";
import { err, ok, type Result } from "@/lib/result";
import { isValidLimits, type UserLimits } from "@/server/domain/user-limits";
import * as repo from "@/server/repositories/limits";
import { MAX_BUDGET_MICROS, MIN_BUDGET_MICROS } from "@/server/services/budget";
import { isSuperadminEmail } from "@/server/services/access";

// Per-user limits (M6.3, D-026). `null` = unlimited (the workspace owner is a superadmin).

export type LimitsContext = { limits: UserLimits | null; timezone: string };

export async function getLimitsContext(workspaceId: string): Promise<LimitsContext> {
  const found = await repo.findWorkspaceLimits(workspaceId);
  if (!found) throw new Error("Workspace not found");
  // The env list also counts, so limits never apply to the owner even before a role sync.
  const unlimited = found.role === "SUPERADMIN" || isSuperadminEmail(found.ownerEmail);
  return { limits: unlimited ? null : found.limits, timezone: found.timezone };
}

export async function getLimits(workspaceId: string): Promise<UserLimits | null> {
  return (await getLimitsContext(workspaceId)).limits;
}

function startOfLocalDay(now: Date, timeZone: string): Date {
  return zonedToUtc(localDateOf(now, timeZone), "00:00", timeZone);
}

/** How many times a limited feature was used today (workspace-local day). */
export async function usedToday(
  workspaceId: string,
  kind: FeatureKind,
  timezone: string,
  now: Date,
  targetId?: string,
): Promise<number> {
  return repo.countFeatureUsageSince(workspaceId, kind, startOfLocalDay(now, timezone), targetId);
}

export const recordFeatureUsage = repo.recordFeatureUsage;

export async function saveUserLimits(
  email: string,
  limits: UserLimits,
  budgetDollars: number,
): Promise<Result<null, "invalid_limits" | "not_found" | "superadmin">> {
  if (isSuperadminEmail(email)) return err("superadmin");
  if (!isValidLimits(limits) || !Number.isFinite(budgetDollars)) return err("invalid_limits");
  const budgetMicros = BigInt(Math.round(budgetDollars * 100)) * 10_000n;
  if (budgetMicros < MIN_BUDGET_MICROS || budgetMicros > MAX_BUDGET_MICROS) {
    return err("invalid_limits");
  }
  return (await repo.updateLimitsByOwnerEmail(email, limits, budgetMicros))
    ? ok(null)
    : err("not_found");
}
