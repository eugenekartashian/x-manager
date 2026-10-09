import "server-only";
import { prisma } from "@/server/db";

// Repost checks (M7.3). Every query is scoped by workspaceId, except the free global
// "no reply" expiry used by the cron job.

/** The latest confirmed message with a post link to this creator, if any. */
export function latestPromotion(workspaceId: string, targetId: string, since: Date) {
  return prisma.creatorEvent.findFirst({
    where: {
      workspaceId,
      targetId,
      kind: "MESSAGE_OPENED",
      undoneAt: null,
      postUrl: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { postUrl: true, createdAt: true },
  });
}

/** Creators still "Messaged" (waiting for their repost), newest contact first. */
export function waitingCreators(workspaceId: string, take: number) {
  return prisma.targetAccount.findMany({
    where: { workspaceId, status: "CONTACTED" },
    orderBy: { lastContactAt: "desc" },
    select: { id: true },
    take,
  });
}

/** Found their Repost → "Reposted" (unless already further along) + history. */
export async function markCreatorReposted(
  workspaceId: string,
  targetId: string,
  note: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.targetAccount.updateMany({
    where: {
      id: targetId,
      workspaceId,
      status: { in: ["NEW", "CONTACTED", "NO_REPLY", "DECLINED"] },
    },
    data: { status: "REPOSTED", theyRepostedAt: now },
  });
  if (count === 0) return false;
  await prisma.creatorEvent.create({
    data: {
      workspaceId,
      targetId,
      kind: "STATUS_CHANGED",
      status: "REPOSTED",
      text: note,
      createdAt: now,
    },
  });
  return true;
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
