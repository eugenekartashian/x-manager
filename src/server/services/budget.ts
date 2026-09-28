import "server-only";
import { err, ok, type Result } from "@/lib/result";
import { monthToDateSpendMicros } from "@/server/repositories/usage";
import {
  getMonthlyBudgetMicros,
  updateMonthlyBudgetMicros,
} from "@/server/repositories/workspaces";

export type BudgetStatus = { spentMicros: bigint; budgetMicros: bigint };
export type BudgetLevel = "ok" | "warning" | "exhausted";

/** Warn once 80% of the monthly budget is used. */
export const BUDGET_WARNING_RATIO = 0.8;
export const MIN_BUDGET_MICROS = 1_000_000n; // $1
export const MAX_BUDGET_MICROS = 500_000_000n; // $500

export async function getBudgetStatus(workspaceId: string, now: Date): Promise<BudgetStatus> {
  const [spentMicros, budgetMicros] = await Promise.all([
    monthToDateSpendMicros(workspaceId, now),
    getMonthlyBudgetMicros(workspaceId),
  ]);
  return { spentMicros, budgetMicros };
}

export function budgetLevel({ spentMicros, budgetMicros }: BudgetStatus): BudgetLevel {
  if (spentMicros >= budgetMicros) return "exhausted";
  if (Number(spentMicros) >= Number(budgetMicros) * BUDGET_WARNING_RATIO) return "warning";
  return "ok";
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

/** Sets the monthly budget from dollars (e.g. 5 or 12.5). */
export async function saveMonthlyBudget(
  workspaceId: string,
  dollars: number,
): Promise<Result<null, "invalid_budget">> {
  if (!Number.isFinite(dollars)) return err("invalid_budget");
  const micros = BigInt(Math.round(dollars * 100)) * 10_000n; // whole cents
  if (micros < MIN_BUDGET_MICROS || micros > MAX_BUDGET_MICROS) return err("invalid_budget");
  await updateMonthlyBudgetMicros(workspaceId, micros);
  return ok(null);
}
