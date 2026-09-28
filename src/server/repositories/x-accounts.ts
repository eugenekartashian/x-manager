import "server-only";
import type { Prisma, XAccount } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Public view: never includes token columns.
const connectionView = {
  id: true,
  username: true,
  name: true,
  status: true,
  connectedAt: true,
} as const;

export type XConnectionView = Prisma.XAccountGetPayload<{ select: typeof connectionView }>;

export function findConnection(workspaceId: string): Promise<XConnectionView | null> {
  return prisma.xAccount.findUnique({ where: { workspaceId }, select: connectionView });
}

export async function findWorkspaceIdForXUser(xUserId: string): Promise<string | null> {
  const row = await prisma.xAccount.findUnique({
    where: { xUserId },
    select: { workspaceId: true },
  });
  return row?.workspaceId ?? null;
}

export type StoredConnection = {
  xUserId: string;
  username: string;
  name: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessTokenExpiresAt: Date;
  scopes: string;
};

/** Connect or reconnect the workspace's single X account. */
export function saveConnection(
  workspaceId: string,
  data: StoredConnection,
): Promise<XConnectionView> {
  const fields = {
    ...data,
    status: "CONNECTED" as const,
    connectedAt: new Date(),
    lastRefreshedAt: null,
  };
  return prisma.xAccount.upsert({
    where: { workspaceId },
    create: { workspaceId, ...fields },
    update: fields,
    select: connectionView,
  });
}

/** Deletes the workspace's X account and returns it (tokens included, for revocation). */
export function deleteConnection(workspaceId: string): Promise<XAccount | null> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.xAccount.findUnique({ where: { workspaceId } });
    if (account) await tx.xAccount.delete({ where: { id: account.id } });
    return account;
  });
}

/**
 * Runs `fn` with the workspace's X account row locked (SELECT … FOR UPDATE), so
 * concurrent token refreshes are serialized — X refresh tokens are single-use.
 */
export function withLockedXAccount<T>(
  workspaceId: string,
  fn: (account: XAccount | null, tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "x_account" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
      const account = await tx.xAccount.findUnique({ where: { workspaceId } });
      return fn(account, tx);
    },
    { timeout: 20_000 },
  );
}
