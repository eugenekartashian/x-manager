import { prisma } from "@/server/db";

// Wipes all app tables. Only ever runs against the test database (see global-setup).
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "workspace", "session", "account", "verification", "user" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(id: string, email: string, name = id) {
  return prisma.user.create({ data: { id, email, name, emailVerified: true } });
}
