import "server-only";
import type { CandidateStatus, CreatorCandidate } from "@/generated/prisma/client";
import type { XProfile } from "@/server/integrations/x/client";
import { prisma } from "@/server/db";

// "Find similar" suggestions (D-038). Every query is scoped by workspaceId.

/** X user ids already in the list or already suggested (any status) — never suggested again. */
export async function knownXUserIds(workspaceId: string, xUserIds: string[]): Promise<Set<string>> {
  if (xUserIds.length === 0) return new Set();
  const [targets, candidates] = await Promise.all([
    prisma.targetAccount.findMany({
      where: { workspaceId, xUserId: { in: xUserIds } },
      select: { xUserId: true },
    }),
    prisma.creatorCandidate.findMany({
      where: { workspaceId, xUserId: { in: xUserIds } },
      select: { xUserId: true },
    }),
  ]);
  return new Set([...targets, ...candidates].map((row) => row.xUserId));
}

export async function insertCandidates(
  workspaceId: string,
  profiles: XProfile[],
  via: string,
): Promise<number> {
  const { count } = await prisma.creatorCandidate.createMany({
    data: profiles.map((profile) => ({
      workspaceId,
      xUserId: profile.id,
      username: profile.username,
      name: profile.name,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      verified: profile.verified,
      followersCount: profile.followers,
      followingCount: profile.following,
      postsCount: profile.posts,
      followsYou: profile.followsYou,
      youFollow: profile.youFollow,
      via,
    })),
    skipDuplicates: true,
  });
  return count;
}

export function listPendingCandidates(
  workspaceId: string,
  limit: number,
): Promise<CreatorCandidate[]> {
  return prisma.creatorCandidate.findMany({
    where: { workspaceId, status: "PENDING" },
    orderBy: [{ followersCount: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: limit,
  });
}

export function countPendingCandidates(workspaceId: string): Promise<number> {
  return prisma.creatorCandidate.count({ where: { workspaceId, status: "PENDING" } });
}

export function findPendingCandidates(
  workspaceId: string,
  ids: string[],
): Promise<CreatorCandidate[]> {
  return prisma.creatorCandidate.findMany({
    where: { workspaceId, id: { in: ids }, status: "PENDING" },
    take: ids.length,
  });
}

export async function setCandidatesStatus(
  workspaceId: string,
  ids: string[],
  status: CandidateStatus,
): Promise<number> {
  const { count } = await prisma.creatorCandidate.updateMany({
    where: { workspaceId, id: { in: ids }, status: "PENDING" },
    data: { status },
  });
  return count;
}

export async function saveFollowingCursor(
  workspaceId: string,
  targetId: string,
  nextToken: string | null,
): Promise<void> {
  await prisma.targetAccount.updateMany({
    where: { id: targetId, workspaceId },
    data: { followingCursor: nextToken, followingExhausted: nextToken === null },
  });
}
