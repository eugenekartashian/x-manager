import { prisma } from "@/server/db";

// Wipes all app tables. Only ever runs against the test database (see global-setup).
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "external_usage", "x_account", "workspace", "session", "account", "verification", "user" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(id: string, email: string, name = id) {
  return prisma.user.create({ data: { id, email, name, emailVerified: true } });
}

export async function createOwner(suffix: "a" | "b") {
  const user = await createUser(`user-${suffix}`, `owner-${suffix}@example.com`);
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: suffix } });
  return { userId: user.id, workspaceId: workspace.id };
}
