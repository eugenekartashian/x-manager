import "server-only";
import type { AttemptStep, Prisma, RepostStatus, ScheduledRepost } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// ─── Workspace lease ─────────────────────────────────────────────────────────

export async function listSchedulableWorkspaceIds(limit: number): Promise<string[]> {
  const rows = await prisma.repostSchedule.findMany({
    where: { active: true, slots: { some: {} } },
    select: { workspaceId: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  return rows.map((row) => row.workspaceId);
}

/** Atomically takes the workspace for `leaseMs`; false if another worker holds it. */
export async function claimWorkspace(
  workspaceId: string,
  now: Date,
  leaseMs: number,
): Promise<boolean> {
  const { count } = await prisma.repostSchedule.updateMany({
    where: { workspaceId, OR: [{ processingUntil: null }, { processingUntil: { lt: now } }] },
    data: { processingUntil: new Date(now.getTime() + leaseMs) },
  });
  return count === 1;
}

export async function releaseWorkspace(workspaceId: string): Promise<void> {
  await prisma.repostSchedule.updateMany({
    where: { workspaceId },
    data: { processingUntil: null },
  });
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export async function recordedKeys(workspaceId: string, since: Date): Promise<Set<string>> {
  const rows = await prisma.scheduledRepost.findMany({
    where: { workspaceId, runAt: { gte: since } },
    select: { dedupeKey: true },
  });
  return new Set(rows.map((row) => row.dedupeKey));
}

/** Inserts the occurrence; null if another worker already claimed this dedupe key. */
export async function insertRun(
  data: Prisma.ScheduledRepostUncheckedCreateInput,
): Promise<ScheduledRepost | null> {
  try {
    return await prisma.scheduledRepost.create({ data });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
      return null;
    throw error;
  }
}

export async function finishRun(
  id: string,
  data: {
    status: RepostStatus;
    skipReason?: string | null;
    errorCode?: string | null;
    finishedAt: Date;
  },
): Promise<void> {
  await prisma.scheduledRepost.update({ where: { id }, data: { ...data, leaseUntil: null } });
}

/** Success or unknown outcome: record the Repost on the post. */
export async function finishRepost(
  run: ScheduledRepost,
  status: "SUCCEEDED" | "UNKNOWN",
  now: Date,
  errorCode: string | null = null,
): Promise<void> {
  await prisma.$transaction([
    prisma.scheduledRepost.update({
      where: { id: run.id },
      data: { status, errorCode, finishedAt: now, leaseUntil: null },
    }),
    ...(run.ownPostId
      ? [
          prisma.ownPost.updateMany({
            where: { id: run.ownPostId, workspaceId: run.workspaceId },
            data: { lastRepostedAt: now },
          }),
        ]
      : []),
  ]);
}

export async function recordAttempt(data: {
  scheduledRepostId: string;
  workspaceId: string;
  step: AttemptStep;
  outcome: string;
  startedAt: Date;
  finishedAt: Date;
}): Promise<void> {
  await prisma.repostAttempt.create({ data });
}

/** Runs left in PROCESSING by a crashed worker, claimed one by one. */
export async function claimStaleRuns(
  now: Date,
  leaseMs: number,
  limit: number,
): Promise<ScheduledRepost[]> {
  const stale = await prisma.scheduledRepost.findMany({
    where: { status: "PROCESSING", leaseUntil: { lt: now } },
    take: limit,
    orderBy: { runAt: "asc" },
  });
  const claimed: ScheduledRepost[] = [];
  for (const run of stale) {
    const { count } = await prisma.scheduledRepost.updateMany({
      where: { id: run.id, status: "PROCESSING", leaseUntil: { lt: now } },
      data: { leaseUntil: new Date(now.getTime() + leaseMs) },
    });
    if (count === 1) claimed.push(run);
  }
  return claimed;
}

export function listRecentRuns(workspaceId: string, take: number) {
  return prisma.scheduledRepost.findMany({
    where: { workspaceId },
    orderBy: { runAt: "desc" },
    take,
    include: { ownPost: true },
  });
}
