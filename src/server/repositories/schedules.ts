import "server-only";
import type { Prisma, RepostSchedule, SlotTarget } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export function getOrCreateSchedule(
  workspaceId: string,
  defaultStartDate: string,
): Promise<RepostSchedule> {
  return prisma.repostSchedule.upsert({
    where: { workspaceId },
    create: { workspaceId, startDate: defaultStartDate },
    update: {},
  });
}

export function updateSchedule(
  workspaceId: string,
  data: {
    active: boolean;
    startDate: string;
    durationDays: number | null;
    consentedAt: Date | null;
  },
): Promise<RepostSchedule> {
  return prisma.repostSchedule.update({ where: { workspaceId }, data });
}

const slotWithPost = { ownPost: true } satisfies Prisma.RepostSlotInclude;
export type SlotWithPost = Prisma.RepostSlotGetPayload<{ include: typeof slotWithPost }>;

export function listSlots(workspaceId: string): Promise<SlotWithPost[]> {
  return prisma.repostSlot.findMany({
    where: { workspaceId },
    include: slotWithPost,
    orderBy: { createdAt: "asc" },
  });
}

export function countSlots(workspaceId: string): Promise<number> {
  return prisma.repostSlot.count({ where: { workspaceId } });
}

export function createSlot(
  workspaceId: string,
  scheduleId: string,
  data: { localTime: string; timezone: string; target: SlotTarget; ownPostId: string | null },
) {
  return prisma.repostSlot.create({ data: { workspaceId, scheduleId, ...data } });
}

/** Scoped delete: returns false if the slot does not belong to the workspace. */
export async function deleteSlot(workspaceId: string, slotId: string): Promise<boolean> {
  const { count } = await prisma.repostSlot.deleteMany({ where: { id: slotId, workspaceId } });
  return count > 0;
}

export async function updateRepostInterval(workspaceId: string, minutes: number): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { perPostMinIntervalMinutes: minutes },
  });
}
