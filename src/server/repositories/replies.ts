import "server-only";
import type { ReplyLog, ReplyTemplate, TargetAccount, TargetPost } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { XPost } from "@/server/integrations/x/client";

// ─── Templates ───────────────────────────────────────────────────────────────

export function listTemplates(workspaceId: string): Promise<ReplyTemplate[]> {
  return prisma.replyTemplate.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
}

export function countTemplates(workspaceId: string): Promise<number> {
  return prisma.replyTemplate.count({ where: { workspaceId } });
}

export function createTemplate(workspaceId: string, text: string): Promise<ReplyTemplate> {
  return prisma.replyTemplate.create({ data: { workspaceId, text } });
}

export async function deleteTemplate(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.replyTemplate.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}

// ─── Targets & their posts ───────────────────────────────────────────────────

export function findTarget(workspaceId: string, id: string): Promise<TargetAccount | null> {
  return prisma.targetAccount.findFirst({ where: { id, workspaceId } });
}

/** Atomically claims a posts load for the target (throttle); false if loaded too recently. */
export async function claimTargetPostsLoad(
  workspaceId: string,
  targetId: string,
  now: Date,
  minIntervalMs: number,
): Promise<boolean> {
  const { count } = await prisma.targetAccount.updateMany({
    where: {
      id: targetId,
      workspaceId,
      OR: [
        { postsFetchedAt: null },
        { postsFetchedAt: { lt: new Date(now.getTime() - minIntervalMs) } },
      ],
    },
    data: { postsFetchedAt: now },
  });
  return count === 1;
}

/** Replaces the cached latest posts of a target. */
export async function replaceTargetPosts(
  workspaceId: string,
  targetId: string,
  posts: XPost[],
  now: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.targetPost.deleteMany({ where: { workspaceId, targetId } }),
    prisma.targetPost.createMany({
      data: posts.map((post) => ({
        workspaceId,
        targetId,
        xPostId: post.id,
        text: post.text,
        postedAt: post.createdAt,
        mediaType: post.media?.type ?? null,
        mediaPreviewUrl: post.media?.previewUrl ?? null,
        mediaCount: post.media?.count ?? 0,
        likeCount: post.metrics?.likes ?? null,
        replyCount: post.metrics?.replies ?? null,
        impressionCount: post.metrics?.impressions ?? null,
        fetchedAt: now,
      })),
    }),
  ]);
}

export function listTargetPosts(workspaceId: string, targetId: string): Promise<TargetPost[]> {
  return prisma.targetPost.findMany({
    where: { workspaceId, targetId },
    orderBy: { postedAt: "desc" },
  });
}

export function findTargetPost(
  workspaceId: string,
  targetId: string,
  xPostId: string,
): Promise<TargetPost | null> {
  return prisma.targetPost.findFirst({ where: { workspaceId, targetId, xPostId } });
}

// ─── Reply log ───────────────────────────────────────────────────────────────

export function countOpenedSince(workspaceId: string, since: Date): Promise<number> {
  return prisma.replyLog.count({
    where: { workspaceId, status: "OPENED", openedAt: { gte: since } },
  });
}

/** Most recent counted reply to this target (ignores undone ones). */
export async function lastOpenedForTarget(
  workspaceId: string,
  targetId: string,
): Promise<Date | null> {
  const row = await prisma.replyLog.findFirst({
    where: { workspaceId, targetId, status: "OPENED" },
    orderBy: { openedAt: "desc" },
    select: { openedAt: true },
  });
  return row?.openedAt ?? null;
}

export async function recordOpened(input: {
  workspaceId: string;
  target: TargetAccount;
  xPostId: string;
  text: string;
  now: Date;
}): Promise<ReplyLog> {
  const [log] = await prisma.$transaction([
    prisma.replyLog.create({
      data: {
        workspaceId: input.workspaceId,
        targetId: input.target.id,
        targetUsername: input.target.username,
        xPostId: input.xPostId,
        text: input.text,
        openedAt: input.now,
      },
    }),
    prisma.targetAccount.update({
      where: { id: input.target.id },
      data: { lastRepliedAt: input.now },
    }),
  ]);
  return log;
}

/** Marks a reply as not posted and restores the target's last reply time. */
export async function undoReply(workspaceId: string, id: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const log = await tx.replyLog.findFirst({ where: { id, workspaceId, status: "OPENED" } });
    if (!log) return false;
    await tx.replyLog.update({ where: { id }, data: { status: "UNDONE", undoneAt: now } });
    if (log.targetId) {
      const previous = await tx.replyLog.findFirst({
        where: { workspaceId, targetId: log.targetId, status: "OPENED" },
        orderBy: { openedAt: "desc" },
        select: { openedAt: true },
      });
      await tx.targetAccount.updateMany({
        where: { id: log.targetId, workspaceId },
        data: { lastRepliedAt: previous?.openedAt ?? null },
      });
    }
    return true;
  });
}

export function listRecentReplies(workspaceId: string, take: number) {
  return prisma.replyLog.findMany({ where: { workspaceId }, orderBy: { openedAt: "desc" }, take });
}

export async function updateReplyLimits(
  workspaceId: string,
  cooldownHours: number,
  perDay: number,
): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { replyCooldownHours: cooldownHours, replyDailyLimit: perDay },
  });
}
