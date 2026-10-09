import "server-only";
import type {
  CreatorRole,
  CreatorSource,
  CreatorStatus,
  Prisma,
  TargetAccount,
} from "@/generated/prisma/client";
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
  source: CreatorSource = "MANUAL",
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
        followsYou: profile.followsYou,
        youFollow: profile.youFollow,
        lookedUpAt: now,
      };
      return prisma.targetAccount.upsert({
        where: { workspaceId_xUserId: { workspaceId, xUserId: profile.id } },
        create: { workspaceId, xUserId: profile.id, source, ...fields },
        update: fields,
      });
    }),
  );
}

/** Updates profile snapshots of creators already in the workspace (never adds new ones). */
export async function updateLookedUpProfiles(
  workspaceId: string,
  profiles: XProfile[],
  now: Date,
): Promise<void> {
  await prisma.$transaction(
    profiles.map((profile) =>
      prisma.targetAccount.updateMany({
        where: { workspaceId, xUserId: profile.id },
        data: {
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
          lookedUpAt: now,
        },
      }),
    ),
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

export function findTargetIdByUsername(
  workspaceId: string,
  username: string,
): Promise<{ id: string } | null> {
  return prisma.targetAccount.findFirst({
    where: { workspaceId, username: { equals: username, mode: "insensitive" } },
    select: { id: true },
  });
}

// ─── Collab CRM table (M7.1) ─────────────────────────────────────────────────

export type CreatorSort = "followers" | "recent" | "contact";

/** Relationship filter (D-036): from X's connection_status at the last lookup. */
export type ConnectionFilter = "follows" | "mutual" | "none" | "unknown";

const CONNECTION_WHERE: Record<ConnectionFilter, Prisma.TargetAccountWhereInput> = {
  follows: { followsYou: true },
  mutual: { followsYou: true, youFollow: true },
  none: { followsYou: false, youFollow: false },
  unknown: { followsYou: null },
};

export type CreatorQuery = {
  status?: CreatorStatus;
  /** They reposted our post and we haven't reposted back yet. */
  owed?: boolean;
  role?: CreatorRole;
  connection?: ConnectionFilter;
  search?: string;
  tag?: string;
  sort: CreatorSort;
  page: number; // 1-based
  pageSize: number;
};

function creatorWhere(workspaceId: string, query: CreatorQuery): Prisma.TargetAccountWhereInput {
  const search = query.search?.trim().replace(/^@/, "");
  return {
    workspaceId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.owed ? { status: "REPOSTED" as const, repostedBackAt: null } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.connection ? CONNECTION_WHERE[query.connection] : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

const CREATOR_ORDER: Record<CreatorSort, Prisma.TargetAccountOrderByWithRelationInput[]> = {
  followers: [{ followersCount: { sort: "desc", nulls: "last" } }, { username: "asc" }],
  recent: [{ createdAt: "desc" }],
  contact: [{ lastContactAt: { sort: "desc", nulls: "last" } }, { username: "asc" }],
};

export async function listCreatorsPage(
  workspaceId: string,
  query: CreatorQuery,
): Promise<{ rows: TargetAccount[]; total: number }> {
  const where = creatorWhere(workspaceId, query);
  const [rows, total] = await prisma.$transaction([
    prisma.targetAccount.findMany({
      where,
      orderBy: CREATOR_ORDER[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.targetAccount.count({ where }),
  ]);
  return { rows, total };
}

export async function countCreatorsByStatus(
  workspaceId: string,
): Promise<Partial<Record<CreatorStatus, number>>> {
  const rows = await prisma.targetAccount.groupBy({
    by: ["status"],
    where: { workspaceId },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

export async function listCreatorTags(workspaceId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM target_account
    WHERE "workspaceId" = ${workspaceId}
    ORDER BY tag
    LIMIT 200`;
  return rows.map((row) => row.tag);
}

/** Scoped bulk status change; contacting stamps lastContactAt. */
export async function setCreatorsStatus(
  workspaceId: string,
  ids: string[],
  status: CreatorStatus,
  now: Date,
): Promise<number> {
  const { count } = await prisma.targetAccount.updateMany({
    where: { workspaceId, id: { in: ids } },
    data: { status, ...(status === "CONTACTED" ? { lastContactAt: now } : {}) },
  });
  return count;
}

export async function addCreatorsTag(workspaceId: string, ids: string[], tag: string) {
  return prisma.$executeRaw`
    UPDATE target_account SET tags = array_append(tags, ${tag})
    WHERE "workspaceId" = ${workspaceId} AND id = ANY(${ids}) AND NOT (${tag} = ANY(tags))`;
}

export async function removeCreatorsTag(workspaceId: string, ids: string[], tag: string) {
  return prisma.$executeRaw`
    UPDATE target_account SET tags = array_remove(tags, ${tag})
    WHERE "workspaceId" = ${workspaceId} AND id = ANY(${ids})`;
}

/** Usernames of the selected creators (scoped), for a fresh lookup. */
export async function usernamesOf(workspaceId: string, ids: string[]): Promise<string[]> {
  const rows = await prisma.targetAccount.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { username: true },
    take: ids.length,
  });
  return rows.map((row) => row.username);
}

export async function deleteCreators(workspaceId: string, ids: string[]): Promise<number> {
  const { count } = await prisma.targetAccount.deleteMany({
    where: { workspaceId, id: { in: ids } },
  });
  return count;
}

export async function setCreatorsRole(
  workspaceId: string,
  ids: string[],
  role: CreatorRole | null,
): Promise<number> {
  const { count } = await prisma.targetAccount.updateMany({
    where: { workspaceId, id: { in: ids } },
    data: { role },
  });
  return count;
}
