import "server-only";
import * as runs from "@/server/repositories/repost-runs";
import { monthSpendByOperation, type SpendByOperation } from "@/server/repositories/usage";
import {
  budgetLevel,
  getBudgetStatus,
  type BudgetLevel,
  type BudgetStatus,
} from "@/server/services/budget";

export const HISTORY_PAGE_SIZE = 100;

export type HistoryPageData = {
  runs: Awaited<ReturnType<typeof runs.listRecentRuns>>;
  monthCounts: Awaited<ReturnType<typeof runs.countRunsByStatus>>;
  spend: SpendByOperation[];
  budget: BudgetStatus;
  level: BudgetLevel;
};

/** History for the signed-in workspace only; the month is the UTC calendar month (as billing). */
export async function getHistoryPageData(
  workspaceId: string,
  filter: runs.RunFilter,
  now: Date = new Date(),
): Promise<HistoryPageData> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [list, monthCounts, spend, budget] = await Promise.all([
    runs.listRecentRuns(workspaceId, HISTORY_PAGE_SIZE, filter),
    runs.countRunsByStatus(workspaceId, monthStart),
    monthSpendByOperation(workspaceId, now),
    getBudgetStatus(workspaceId, now),
  ]);
  return { runs: list, monthCounts, spend, budget, level: budgetLevel(budget) };
}
