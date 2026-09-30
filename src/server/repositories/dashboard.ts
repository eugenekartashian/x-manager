import "server-only";
import type { RepostStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Daily aggregates for the dashboard (M6.7). Every query is scoped by workspaceId; days are
// calendar days in the workspace timezone. Timestamps are stored as UTC without zone.

export type DayCount = { day: string; count: number };

export function dailyRunsByStatus(
  workspaceId: string,
  since: Date,
  timeZone: string,
): Promise<(DayCount & { status: RepostStatus })[]> {
  return prisma.$queryRaw`
    SELECT to_char(("runAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           status,
           count(*)::int AS count
    FROM scheduled_repost
    WHERE "workspaceId" = ${workspaceId} AND "runAt" >= ${since}
    GROUP BY 1, 2`;
}

export function dailyReplies(
  workspaceId: string,
  since: Date,
  timeZone: string,
): Promise<DayCount[]> {
  return prisma.$queryRaw`
    SELECT to_char(("openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           count(*)::int AS count
    FROM reply_log
    WHERE "workspaceId" = ${workspaceId} AND "openedAt" >= ${since} AND "undoneAt" IS NULL
    GROUP BY 1`;
}

export function dailySpendMicros(
  workspaceId: string,
  since: Date,
  timeZone: string,
): Promise<{ day: string; micros: bigint }[]> {
  return prisma.$queryRaw`
    SELECT to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           sum("costMicros")::bigint AS micros
    FROM external_usage
    WHERE "workspaceId" = ${workspaceId} AND "occurredAt" >= ${since}
    GROUP BY 1`;
}

export function countFeatureUsageSince(workspaceId: string, since: Date) {
  return prisma.featureUsage.groupBy({
    by: ["kind"],
    where: { workspaceId, occurredAt: { gte: since } },
    _count: { _all: true },
  });
}
