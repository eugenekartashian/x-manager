import "server-only";
import type { UsageProvider } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export function recordUsage(input: {
  workspaceId: string;
  provider: UsageProvider;
  operation: string;
  units: number;
  costMicros: number;
}): Promise<unknown> {
  return prisma.externalUsage.create({
    data: { ...input, costMicros: BigInt(input.costMicros) },
  });
}

/** Estimated spend since the start of the current UTC calendar month, in micro-dollars. */
export async function monthToDateSpendMicros(workspaceId: string, now: Date): Promise<bigint> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const result = await prisma.externalUsage.aggregate({
    where: { workspaceId, occurredAt: { gte: monthStart } },
    _sum: { costMicros: true },
  });
  return result._sum.costMicros ?? 0n;
}
