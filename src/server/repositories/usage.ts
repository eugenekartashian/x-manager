import "server-only";
import type { UsageProvider } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type BillableResources = { kind: "post" | "user"; ids: string[] };

/**
 * Records one external call. For reads, pass the returned resource ids: X bills each
 * resource once per UTC day, so only ids not yet billed today count toward the cost.
 */
export async function recordUsage(input: {
  workspaceId: string;
  provider: UsageProvider;
  operation: string;
  units: number;
  unitPriceMicros: number;
  resources?: BillableResources;
  now?: Date;
}): Promise<{ billedUnits: number }> {
  const { workspaceId, provider, operation, units, unitPriceMicros, resources } = input;
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    let billedUnits = units;
    if (resources) {
      const day = now.toISOString().slice(0, 10);
      const ids = [...new Set(resources.ids)];
      const created = await tx.billedResource.createMany({
        data: ids.map((resourceId) => ({ workspaceId, day, kind: resources.kind, resourceId })),
        skipDuplicates: true,
      });
      billedUnits = created.count;
    }
    await tx.externalUsage.create({
      data: {
        workspaceId,
        provider,
        operation,
        units,
        billedUnits,
        costMicros: BigInt(billedUnits * unitPriceMicros),
        occurredAt: now,
      },
    });
    return { billedUnits };
  });
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Estimated spend since the start of the current UTC calendar month, in micro-dollars. */
export async function monthToDateSpendMicros(workspaceId: string, now: Date): Promise<bigint> {
  const result = await prisma.externalUsage.aggregate({
    where: { workspaceId, occurredAt: { gte: monthStartUtc(now) } },
    _sum: { costMicros: true },
  });
  return result._sum.costMicros ?? 0n;
}

/** Estimated spend of ALL workspaces this UTC month (global cap only — never shown to users). */
export async function monthToDateSpendAllMicros(now: Date): Promise<bigint> {
  const result = await prisma.externalUsage.aggregate({
    where: { occurredAt: { gte: monthStartUtc(now) } },
    _sum: { costMicros: true },
  });
  return result._sum.costMicros ?? 0n;
}

export type SpendByOperation = {
  operation: string;
  calls: number;
  billedUnits: number;
  costMicros: bigint;
};

/** This month's estimated spend grouped by operation, most expensive first. */
export async function monthSpendByOperation(
  workspaceId: string,
  now: Date,
): Promise<SpendByOperation[]> {
  const rows = await prisma.externalUsage.groupBy({
    by: ["operation"],
    where: { workspaceId, occurredAt: { gte: monthStartUtc(now) } },
    _count: { _all: true },
    _sum: { billedUnits: true, costMicros: true },
  });
  return rows
    .map((row) => ({
      operation: row.operation,
      calls: row._count._all,
      billedUnits: row._sum.billedUnits ?? 0,
      costMicros: row._sum.costMicros ?? 0n,
    }))
    .sort((a, b) => Number(b.costMicros - a.costMicros));
}

export function countUsageSince(
  workspaceId: string,
  operation: string,
  since: Date,
): Promise<number> {
  return prisma.externalUsage.count({
    where: { workspaceId, operation, occurredAt: { gte: since } },
  });
}
