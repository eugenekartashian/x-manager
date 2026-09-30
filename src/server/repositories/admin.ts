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
