import "server-only";
import type { Workspace } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export function findWorkspaceByOwner(ownerId: string): Promise<Workspace | null> {
  return prisma.workspace.findUnique({ where: { ownerId } });
}

// Idempotent: safe to call on every sign-in or when a workspace is missing.
export function ensureWorkspaceForOwner(ownerId: string, ownerName: string): Promise<Workspace> {
  const name = ownerName.trim() || "My workspace";
  return prisma.workspace.upsert({
    where: { ownerId },
    create: { ownerId, name },
    update: {},
  });
}
