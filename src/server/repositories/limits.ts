import "server-only";
import type { FeatureKind } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { UserLimits } from "@/server/domain/user-limits";

export async function findWorkspaceLimits(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      timezone: true,
      limitListPosts: true,
      limitDailyTimes: true,
      limitTargets: true,
      limitTargetLoadsPerDay: true,
      limitAiIdeasPerTargetDay: true,
      targetsEnabled: true,
      aiEnabled: true,
      owner: { select: { role: true, email: true } },
    },
  });
  if (!workspace) return null;
  return {
    role: workspace.owner.role,
    ownerEmail: workspace.owner.email,
    timezone: workspace.timezone,
    limits: {
      listPosts: workspace.limitListPosts,
      dailyTimes: workspace.limitDailyTimes,
      targets: workspace.limitTargets,
      targetLoadsPerDay: workspace.limitTargetLoadsPerDay,
      aiIdeasPerTargetPerDay: workspace.limitAiIdeasPerTargetDay,
      targetsEnabled: workspace.targetsEnabled,
      aiEnabled: workspace.aiEnabled,
    } satisfies UserLimits,
  };
}

/** Updates limits of the workspace owned by the user with this email (admin). */
export async function updateLimitsByOwnerEmail(
  email: string,
  limits: UserLimits,
  budgetMicros: bigint,
): Promise<boolean> {
  const { count } = await prisma.workspace.updateMany({
    where: { owner: { email: { equals: email, mode: "insensitive" } } },
    data: {
      limitListPosts: limits.listPosts,
      limitDailyTimes: limits.dailyTimes,
      limitTargets: limits.targets,
      limitTargetLoadsPerDay: limits.targetLoadsPerDay,
      limitAiIdeasPerTargetDay: limits.aiIdeasPerTargetPerDay,
      targetsEnabled: limits.targetsEnabled,
      aiEnabled: limits.aiEnabled,
      monthlyBudgetMicros: budgetMicros,
    },
  });
  return count > 0;
}

export function countFeatureUsageSince(
  workspaceId: string,
  kind: FeatureKind,
  since: Date,
  targetId?: string,
): Promise<number> {
  return prisma.featureUsage.count({
    where: { workspaceId, kind, occurredAt: { gte: since }, ...(targetId ? { targetId } : {}) },
  });
}

export async function recordFeatureUsage(
  workspaceId: string,
  kind: FeatureKind,
  now: Date,
  targetId?: string,
): Promise<void> {
  await prisma.featureUsage.create({
    data: { workspaceId, kind, occurredAt: now, targetId: targetId ?? null },
  });
}
