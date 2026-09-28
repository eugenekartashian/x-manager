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
