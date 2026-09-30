import "server-only";
import { prisma } from "@/server/db";

/**
 * Deletes the user and everything they own. The workspace and all its rows (X account, posts,
 * schedule, runs, targets, replies, templates, usage) go with it via ON DELETE CASCADE;
 * sessions and Better Auth accounts cascade from the user. The invite is removed too.
 */
export async function deleteUserAndData(userId: string, email: string): Promise<void> {
  await prisma.$transaction([
    prisma.accessInvite.deleteMany({ where: { email } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
