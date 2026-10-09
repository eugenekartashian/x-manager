import "server-only";
import type { PromotedPostCheck } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Repost checks (M7.3). Every query is scoped by workspaceId, except the job's listing of
// workspaces with something to check and the global "no reply" expiry.

/** Confirmed messages with a post link to creators still waiting ("Messaged"). */
export function pendingPromotions(workspaceId: string, since: Date) {
  return prisma.creatorEvent.findMany({
    where: {
      workspaceId,
      kind: "MESSAGE_OPENED",
      undoneAt: null,
      postUrl: { not: null },
      createdAt: { gte: since },
      target: { status: "CONTACTED" },
    },
    select: { postUrl: true, target: { select: { id: true, xUserId: true } } },
    take: 1_000,
  });
}

export async function workspacesWithPendingPromotions(
  since: Date,
  limit: number,
): Promise<string[]> {
  const rows = await prisma.creatorEvent.findMany({
    where: {
      kind: "MESSAGE_OPENED",
      undoneAt: null,
      postUrl: { not: null },
      createdAt: { gte: since },
      target: { status: "CONTACTED" },
    },
    distinct: ["workspaceId"],
    select: { workspaceId: true },
    take: limit,
  });
  return rows.map((row) => row.workspaceId);
}

export function findCheck(workspaceId: string, xPostId: string): Promise<PromotedPostCheck | null> {
  return prisma.promotedPostCheck.findUnique({
    where: { workspaceId_xPostId: { workspaceId, xPostId } },
  });
}

export async function saveCheck(
  workspaceId: string,
  xPostId: string,
  seenIds: string[],
  now: Date,
) {
  await prisma.promotedPostCheck.upsert({
    where: { workspaceId_xPostId: { workspaceId, xPostId } },
    create: { workspaceId, xPostId, seenIds, checkedAt: now },
    update: { seenIds, checkedAt: now },
  });
}

export function listChecks(workspaceId: string) {
  return prisma.promotedPostCheck.findMany({
    where: { workspaceId },
    orderBy: { checkedAt: { sort: "desc", nulls: "last" } },
    take: 50,
  });
}

/** Messaged creators whose X ids reposted → "Reposted" (+ history). Returns how many. */
export async function markReposted(
  workspaceId: string,
  xUserIds: string[],
  now: Date,
): Promise<number> {
  if (xUserIds.length === 0) return 0;
  const targets = await prisma.targetAccount.findMany({
    where: { workspaceId, status: "CONTACTED", xUserId: { in: xUserIds } },
    select: { id: true },
  });
  if (targets.length === 0) return 0;
  const ids = targets.map((target) => target.id);
  await prisma.$transaction([
    prisma.targetAccount.updateMany({
      where: { workspaceId, id: { in: ids }, status: "CONTACTED" },
      data: { status: "REPOSTED", theyRepostedAt: now },
    }),
    prisma.creatorEvent.createMany({
      data: ids.map((targetId) => ({
        workspaceId,
        targetId,
        kind: "STATUS_CHANGED" as const,
        status: "REPOSTED" as const,
        text: "Found by the daily repost check",
        createdAt: now,
      })),
    }),
  ]);
  return ids.length;
}

/** Messaged long ago and still no repost → "No reply" (all workspaces, bounded). */
export async function expireNoReply(cutoff: Date, now: Date): Promise<number> {
  const stale = await prisma.targetAccount.findMany({
    where: { status: "CONTACTED", lastContactAt: { lt: cutoff } },
    select: { id: true, workspaceId: true },
    take: 1_000,
  });
  if (stale.length === 0) return 0;
  await prisma.$transaction([
    prisma.targetAccount.updateMany({
      where: { id: { in: stale.map((row) => row.id) }, status: "CONTACTED" },
      data: { status: "NO_REPLY" },
    }),
    prisma.creatorEvent.createMany({
      data: stale.map((row) => ({
        workspaceId: row.workspaceId,
        targetId: row.id,
        kind: "STATUS_CHANGED" as const,
        status: "NO_REPLY" as const,
        text: "No repost within 3 days",
        createdAt: now,
      })),
    }),
  ]);
  return stale.length;
}

export async function setRepostedBack(
  workspaceId: string,
  targetId: string,
  at: Date | null,
): Promise<boolean> {
  const { count } = await prisma.targetAccount.updateMany({
    where: { id: targetId, workspaceId },
    data: { repostedBackAt: at },
  });
  return count > 0;
}

export function countWaitingForMe(workspaceId: string): Promise<number> {
  return prisma.targetAccount.count({
    where: { workspaceId, status: "REPOSTED", repostedBackAt: null },
  });
}

export function countWaitingForThem(workspaceId: string): Promise<number> {
  return prisma.targetAccount.count({ where: { workspaceId, status: "CONTACTED" } });
}

/** Which of these post ids are the workspace's own (synced) posts. */
export async function ownPostIds(workspaceId: string, xPostIds: string[]): Promise<Set<string>> {
  if (xPostIds.length === 0) return new Set();
  const rows = await prisma.ownPost.findMany({
    where: { workspaceId, xPostId: { in: xPostIds } },
    select: { xPostId: true },
  });
  return new Set(rows.map((row) => row.xPostId));
}
