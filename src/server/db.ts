import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in development.
// Typed loosely: after `prisma generate` the cache may hold an instance of an older class.
type CachedClient = { $disconnect(): Promise<void> };
const globalForPrisma = globalThis as unknown as { prisma?: CachedClient };

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  // The dev server reloads the regenerated module, so an old instance lacks new
  // models — replace it instead of reusing it.
  if (cached instanceof PrismaClient) return cached;
  if (cached) void cached.$disconnect();
  return createPrismaClient();
}

export const prisma = getPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
