import { prisma } from "@/server/db";

// Wipes all app tables. Only ever runs against the test database (see global-setup).
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "access_invite", "external_usage", "x_account", "workspace", "session", "account", "verification", "user" RESTART IDENTITY CASCADE',
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

/** Inserts a connected X account directly (bypassing OAuth) with encrypted tokens. */
export async function connectXDirectly(
  workspaceId: string,
  options: { xUserId: string; accessToken: string; expiresAt?: Date },
) {
  const { encrypt } = await import("@/server/crypto");
  const { keyRing } = await import("@/server/keyring");
  return prisma.xAccount.create({
    data: {
      workspaceId,
      xUserId: options.xUserId,
      username: options.xUserId,
      name: options.xUserId,
      accessTokenEnc: encrypt(keyRing, options.accessToken, `x-account:${workspaceId}:access`),
      refreshTokenEnc: encrypt(
        keyRing,
        `refresh-${options.accessToken}`,
        `x-account:${workspaceId}:refresh`,
      ),
      accessTokenExpiresAt: options.expiresAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000),
      scopes: "tweet.read tweet.write users.read offline.access",
    },
  });
}
