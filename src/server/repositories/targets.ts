import "server-only";
import type { TargetAccount } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { XProfile } from "@/server/integrations/x/client";

export type TargetSort = "followers" | "recent";

export function listTargets(
  workspaceId: string,
  sort: TargetSort = "followers",
): Promise<TargetAccount[]> {
  return prisma.targetAccount.findMany({
    where: { workspaceId },
    orderBy:
      sort === "followers"
        ? [{ followersCount: { sort: "desc", nulls: "last" } }, { username: "asc" }]
        : [{ createdAt: "desc" }],
  });
}

export async function existingUsernames(
  workspaceId: string,
  usernames: string[],
): Promise<Set<string>> {
  const rows = await prisma.targetAccount.findMany({
    where: { workspaceId, username: { in: usernames, mode: "insensitive" } },
    select: { username: true },
  });
  return new Set(rows.map((row) => row.username.toLowerCase()));
}

export function countTargets(workspaceId: string): Promise<number> {
  return prisma.targetAccount.count({ where: { workspaceId } });
}

export async function upsertTargets(
  workspaceId: string,
  profiles: XProfile[],
  now: Date,
): Promise<void> {
  await prisma.$transaction(
    profiles.map((profile) => {
      const fields = {
        username: profile.username,
        name: profile.name,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        verified: profile.verified,
        followersCount: profile.followers,
        followingCount: profile.following,
        postsCount: profile.posts,
        lookedUpAt: now,
      };
      return prisma.targetAccount.upsert({
        where: { workspaceId_xUserId: { workspaceId, xUserId: profile.id } },
        create: { workspaceId, xUserId: profile.id, ...fields },
        update: fields,
      });
    }),
  );
}

/** Scoped delete: false if the target is not in the workspace. */
export async function deleteTarget(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.targetAccount.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}

export async function updateTargetNote(
  workspaceId: string,
  id: string,
  note: string | null,
): Promise<boolean> {
  const { count } = await prisma.targetAccount.updateMany({
    where: { id, workspaceId },
    data: { note },
  });
  return count > 0;
}
