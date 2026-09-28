import "server-only";
import { monthToDateSpendMicros } from "@/server/repositories/usage";
import { getMonthlyBudgetMicros } from "@/server/repositories/workspaces";

export type BudgetStatus = { spentMicros: bigint; budgetMicros: bigint };

export async function getBudgetStatus(workspaceId: string, now: Date): Promise<BudgetStatus> {
  const [spentMicros, budgetMicros] = await Promise.all([
    monthToDateSpendMicros(workspaceId, now),
    getMonthlyBudgetMicros(workspaceId),
  ]);
  return { spentMicros, budgetMicros };
}

/** True if an estimated cost still fits this month's budget (D-001). */
export async function canSpend(
  workspaceId: string,
  estimatedMicros: number,
  now: Date,
): Promise<boolean> {
  const { spentMicros, budgetMicros } = await getBudgetStatus(workspaceId, now);
  return spentMicros + BigInt(estimatedMicros) <= budgetMicros;
}
