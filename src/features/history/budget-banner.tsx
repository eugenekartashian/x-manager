import Link from "next/link";
import { formatUsd } from "@/lib/format";
import type { BudgetLevel, BudgetStatus } from "@/server/services/budget";

/** App-wide notice when the monthly API budget is nearly or fully used. */
type Props = { level: BudgetLevel; budget: BudgetStatus; showCosts: boolean };

export function BudgetBanner({ level, budget, showCosts }: Props) {
  if (level === "ok") return null;
  const exhausted = level === "exhausted";
  // Regular users never see prices (M6.3) — only that their monthly limit is reached.
  if (!showCosts) {
    if (!exhausted) return null;
    return (
      <div
        role="alert"
        className="bg-red-500/10 px-4 py-2 text-center text-sm text-red-800 dark:text-red-300"
      >
        You have reached this month&apos;s usage limit — Reposts and loading posts are paused until
        next month.
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={`px-4 py-2 text-center text-sm ${
        exhausted
          ? "bg-red-500/10 text-red-800 dark:text-red-300"
          : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      {exhausted
        ? `Monthly API budget used up (${formatUsd(budget.spentMicros)} of ${formatUsd(budget.budgetMicros)}) — Reposts are paused until next month.`
        : `${formatUsd(budget.spentMicros)} of ${formatUsd(budget.budgetMicros)} monthly API budget used.`}{" "}
      <Link href="/history" className="font-medium underline underline-offset-2">
        See spend
      </Link>
    </div>
  );
}
