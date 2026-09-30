import "server-only";
import type { AccessInvite, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Access invites and app roles (D-025). Emails are passed in already normalized.

export async function hasActiveInvite(email: string): Promise<boolean> {
  const invite = await prisma.accessInvite.findUnique({
    where: { email },
    select: { revokedAt: true },
  });
  return invite !== null && invite.revokedAt === null;
}

/** Creates the invite, or re-activates a revoked one. */
export function upsertInvite(email: string, invitedById: string): Promise<AccessInvite> {
  return prisma.accessInvite.upsert({
    where: { email },
    create: { email, invitedById },
    update: { revokedAt: null, invitedById },
  });
}

export async function revokeInvite(email: string, now: Date): Promise<boolean> {
  const { count } = await prisma.accessInvite.updateMany({
    where: { email, revokedAt: null },
    data: { revokedAt: now },
  });
  return count > 0;
}

export function listInvites(limit = 200): Promise<AccessInvite[]> {
  return prisma.accessInvite.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export function findUserAccess(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { role } });
}

/**
 * Signs the user out everywhere and pauses their Reposts (the job skips paused schedules).
 * Returns their workspace id (if any) so the caller can also drop the X connection.
 */
export async function cutOffUserByEmail(email: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, workspace: { select: { id: true } } },
  });
  if (!user) return null;
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.repostSchedule.updateMany({
      where: { workspace: { ownerId: user.id } },
      data: { active: false },
    }),
  ]);
  return user.workspace?.id ?? null;
}
