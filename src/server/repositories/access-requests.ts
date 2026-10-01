import "server-only";
import type { AccessRequest } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Pending "Want to try" requests (D-032). Superadmin-only reads; bounded.

export function countRequests(): Promise<number> {
  return prisma.accessRequest.count();
}

/** Creates or refreshes a request (same email → latest handle/message win). */
export function upsertRequest(data: {
  email: string;
  xHandle: string | null;
  message: string | null;
}): Promise<AccessRequest> {
  return prisma.accessRequest.upsert({
    where: { email: data.email },
    create: data,
    update: { xHandle: data.xHandle, message: data.message },
  });
}

export function listRequests(limit = 200): Promise<AccessRequest[]> {
  return prisma.accessRequest.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export function findRequest(id: string): Promise<AccessRequest | null> {
  return prisma.accessRequest.findUnique({ where: { id } });
}

export async function deleteRequest(id: string): Promise<boolean> {
  const { count } = await prisma.accessRequest.deleteMany({ where: { id } });
  return count > 0;
}
