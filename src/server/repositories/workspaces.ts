import "server-only";
import type { Workspace } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export function findWorkspaceByOwner(ownerId: string): Promise<Workspace | null> {
  return prisma.workspace.findUnique({ where: { ownerId } });
}

// Idempotent: safe to call on every sign-in or when a workspace is missing.
export function ensureWorkspaceForOwner(ownerId: string, ownerName: string): Promise<Workspace> {
  const name = ownerName.trim() || "My workspace";
  return prisma.workspace.upsert({
    where: { ownerId },
    create: { ownerId, name },
    update: {},
  });
}

export async function getMonthlyBudgetMicros(workspaceId: string): Promise<bigint> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { monthlyBudgetMicros: true },
  });
  return workspace.monthlyBudgetMicros;
}

export async function updateMonthlyBudgetMicros(
  workspaceId: string,
  micros: bigint,
): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { monthlyBudgetMicros: micros },
  });
}

/**
 * Atomically claims a posts sync: succeeds only if the last sync is older than
 * `minIntervalMs`. Concurrent clicks cannot both pass.
 */
export async function claimPostsSync(
  workspaceId: string,
  now: Date,
  minIntervalMs: number,
): Promise<boolean> {
  const { count } = await prisma.workspace.updateMany({
    where: {
      id: workspaceId,
      OR: [
        { postsSyncedAt: null },
        { postsSyncedAt: { lt: new Date(now.getTime() - minIntervalMs) } },
      ],
    },
    data: { postsSyncedAt: now },
  });
  return count === 1;
}
