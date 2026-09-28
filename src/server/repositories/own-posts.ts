import "server-only";
import type { OwnPost } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { XPost } from "@/server/integrations/x/client";

// Every query is scoped by workspaceId AND the connected X user id, so posts of a
// previously connected (different) X account never show up or get reposted.

export type OwnPostScope = { workspaceId: string; xUserId: string };

const RECENT_LIMIT = 50;

export function listRotation(scope: OwnPostScope): Promise<OwnPost[]> {
  return prisma.ownPost.findMany({
    where: { ...scope, inRotation: true },
    orderBy: [{ rotationPosition: "asc" }, { postedAt: "desc" }],
  });
}

export function listRecent(scope: OwnPostScope): Promise<OwnPost[]> {
  return prisma.ownPost.findMany({
    where: scope,
    orderBy: [{ isPinned: "desc" }, { postedAt: "desc" }],
    take: RECENT_LIMIT,
  });
}

export function findByXPostId(scope: OwnPostScope, xPostId: string): Promise<OwnPost | null> {
  return prisma.ownPost.findFirst({ where: { ...scope, xPostId } });
}

/** Inserts or refreshes posts from X; never touches rotation fields. */
export async function upsertPosts(scope: OwnPostScope, posts: XPost[], now: Date): Promise<void> {
  await prisma.$transaction(
    posts.map((post) => {
      const fields = {
        text: post.text,
        postedAt: post.createdAt,
        likeCount: post.metrics?.likes ?? null,
        repostCount: post.metrics?.reposts ?? null,
        replyCount: post.metrics?.replies ?? null,
        impressionCount: post.metrics?.impressions ?? null,
        metricsUpdatedAt: post.metrics ? now : null,
        mediaType: post.media?.type ?? null,
        mediaPreviewUrl: post.media?.previewUrl ?? null,
        mediaCount: post.media?.count ?? 0,
        isQuote: post.isQuote,
        quotedText: post.quotedText?.slice(0, 500) ?? null,
      };
      return prisma.ownPost.upsert({
        where: { workspaceId_xPostId: { workspaceId: scope.workspaceId, xPostId: post.id } },
        create: { ...scope, xPostId: post.id, ...fields },
        update: fields,
      });
    }),
  );
}

/**
 * Drops cached posts that are neither in the latest page, pinned, in the repost
 * list, nor used by a schedule slot — "recent posts" then mirrors X (deleted posts and old comments disappear).
 */
export async function pruneStale(scope: OwnPostScope, keepXPostIds: string[]): Promise<number> {
  const { count } = await prisma.ownPost.deleteMany({
    where: {
      ...scope,
      inRotation: false,
      isPinned: false,
      slots: { none: {} }, // chosen directly by a schedule slot
      xPostId: { notIn: keepXPostIds },
    },
  });
  return count;
}

export async function setPinned(scope: OwnPostScope, pinnedXPostId: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.ownPost.updateMany({
      where: {
        ...scope,
        isPinned: true,
        NOT: pinnedXPostId ? { xPostId: pinnedXPostId } : undefined,
      },
      data: { isPinned: false },
    }),
    ...(pinnedXPostId
      ? [
          prisma.ownPost.updateMany({
            where: { ...scope, xPostId: pinnedXPostId },
            data: { isPinned: true },
          }),
        ]
      : []),
  ]);
}

/** Adds to the end of the repost list (idempotent), unless the list already has `maxSize` posts. */
export function addToRotation(
  scope: OwnPostScope,
  ownPostId: string,
  maxSize: number,
): Promise<"added" | "full" | "not_found"> {
  return prisma.$transaction(async (tx) => {
    const post = await tx.ownPost.findFirst({ where: { ...scope, id: ownPostId } });
    if (!post) return "not_found";
    if (post.inRotation) return "added";
    const last = await tx.ownPost.aggregate({
      where: { ...scope, inRotation: true },
      _max: { rotationPosition: true },
      _count: true,
    });
    if (last._count >= maxSize) return "full";
    await tx.ownPost.update({
      where: { id: post.id },
      data: { inRotation: true, rotationPosition: (last._max.rotationPosition ?? 0) + 1 },
    });
    return "added";
  });
}

export async function removeFromRotation(scope: OwnPostScope, ownPostId: string): Promise<boolean> {
  const { count } = await prisma.ownPost.updateMany({
    where: { ...scope, id: ownPostId },
    data: { inRotation: false, rotationPosition: null },
  });
  return count > 0;
}

/** Swaps the post with its neighbour in the rotation. Returns false if not in scope. */
export function moveInRotation(
  scope: OwnPostScope,
  ownPostId: string,
  direction: "up" | "down",
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const rotation = await tx.ownPost.findMany({
      where: { ...scope, inRotation: true },
      orderBy: [{ rotationPosition: "asc" }, { postedAt: "desc" }],
      select: { id: true },
    });
    const index = rotation.findIndex((post) => post.id === ownPostId);
    if (index === -1) return false;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rotation.length) return true;

    const ids = rotation.map((post) => post.id);
    const moved = ids.splice(index, 1);
    ids.splice(target, 0, ...moved);
    // Renumber densely so positions stay unique and gap-free.
    for (const [position, id] of ids.entries()) {
      await tx.ownPost.update({ where: { id }, data: { rotationPosition: position + 1 } });
    }
    return true;
  });
}

export function findPinned(scope: OwnPostScope): Promise<OwnPost | null> {
  return prisma.ownPost.findFirst({ where: { ...scope, isPinned: true } });
}

export function findInScope(scope: OwnPostScope, ownPostId: string): Promise<OwnPost | null> {
  return prisma.ownPost.findFirst({ where: { ...scope, id: ownPostId } });
}
