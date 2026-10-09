import "server-only";
import type { CreatorEvent, CreatorStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Collab CRM history (M7.2). Every query is scoped by workspaceId.

export function countMessagesOpenedSince(workspaceId: string, since: Date): Promise<number> {
  return prisma.creatorEvent.count({
    where: { workspaceId, kind: "MESSAGE_OPENED", undoneAt: null, createdAt: { gte: since } },
  });
}

/** Records the opened message and moves the creator on, atomically. */
export async function recordMessageOpened(input: {
  workspaceId: string;
  targetId: string;
  previousStatus: CreatorStatus;
  nextStatus: CreatorStatus;
  text: string;
  postUrl: string | null;
  now: Date;
}): Promise<CreatorEvent> {
  const [event] = await prisma.$transaction([
    prisma.creatorEvent.create({
      data: {
        workspaceId: input.workspaceId,
        targetId: input.targetId,
        kind: "MESSAGE_OPENED",
        text: input.text,
        postUrl: input.postUrl,
        // The status before this message, so "Undo" can restore it.
        status: input.previousStatus,
        createdAt: input.now,
      },
    }),
    prisma.targetAccount.updateMany({
      where: { id: input.targetId, workspaceId: input.workspaceId },
      data: { status: input.nextStatus, lastContactAt: input.now },
    }),
  ]);
  return event;
}

export async function undoMessage(
  workspaceId: string,
  eventId: string,
  now: Date,
  notBefore: Date,
): Promise<boolean> {
  const event = await prisma.creatorEvent.findFirst({
    where: {
      id: eventId,
      workspaceId,
      kind: "MESSAGE_OPENED",
      undoneAt: null,
      createdAt: { gte: notBefore },
    },
  });
  if (!event) return false;
  await prisma.$transaction([
    prisma.creatorEvent.update({ where: { id: event.id }, data: { undoneAt: now } }),
    ...(event.status
      ? [
          prisma.targetAccount.updateMany({
            where: { id: event.targetId, workspaceId, status: "CONTACTED" },
            data: { status: event.status },
          }),
        ]
      : []),
  ]);
  return true;
}

export async function recordStatusChange(
  workspaceId: string,
  targetId: string,
  status: CreatorStatus,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.targetAccount.updateMany({
    where: { id: targetId, workspaceId },
    data: { status, ...(status === "CONTACTED" ? { lastContactAt: now } : {}) },
  });
  if (count === 0) return false;
  await prisma.creatorEvent.create({
    data: { workspaceId, targetId, kind: "STATUS_CHANGED", status, createdAt: now },
  });
  return true;
}

export function listCreatorEvents(workspaceId: string, targetId: string, take = 30) {
  return prisma.creatorEvent.findMany({
    where: { workspaceId, targetId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
