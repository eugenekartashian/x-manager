import "server-only";
import { prisma } from "@/server/db";
import { monthStartUtc } from "@/server/repositories/usage";

// Superadmin-only reads across ALL workspaces (D-025). Call only after requireSuperadmin().
// Bounded: the beta has a handful of users; MAX_ROWS keeps queries finite regardless.
const MAX_ROWS = 500;

export function listUsersWithWorkspace() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      workspace: {
        select: {
          id: true,
          monthlyBudgetMicros: true,
          limitListPosts: true,
          limitDailyTimes: true,
          limitTargets: true,
          limitTargetLoadsPerDay: true,
          limitAiIdeasPerTargetDay: true,
          targetsEnabled: true,
          aiEnabled: true,
          xAccount: { select: { username: true, status: true } },
        },
      },
    },
  });
}

export function listAllInvites() {
  return prisma.accessInvite.findMany({ orderBy: { createdAt: "desc" }, take: MAX_ROWS });
}

/** Month-to-date estimated spend per workspace (UTC month, same as the budget guard). */
export async function monthSpendByWorkspace(now: Date): Promise<Map<string, bigint>> {
  const rows = await prisma.externalUsage.groupBy({
    by: ["workspaceId"],
    where: { occurredAt: { gte: monthStartUtc(now) } },
    _sum: { costMicros: true },
  });
  return new Map(rows.map((row) => [row.workspaceId, row._sum.costMicros ?? 0n]));
}

export type TargetPopularity = {
  xUserId: string;
  username: string;
  name: string;
  followers: number | null;
  users: number;
};

/**
 * Public X accounts that users added as targets, aggregated across workspaces: how many users
 * added each one — never who (D-031). Bounded like the other admin reads.
 */
export function targetPopularity(limit = 5_000): Promise<TargetPopularity[]> {
  return prisma.$queryRaw<TargetPopularity[]>`
    SELECT "xUserId",
           max(username) AS username,
           max(name) AS name,
           max("followersCount") AS followers,
           count(DISTINCT "workspaceId")::int AS users
    FROM target_account
    GROUP BY "xUserId"
    ORDER BY users DESC, followers DESC NULLS LAST, username ASC
    LIMIT ${limit}`;
}
