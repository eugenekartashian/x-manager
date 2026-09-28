import Link from "next/link";
import { BudgetForm } from "@/features/history/budget-form";
import { RecentRuns } from "@/features/schedule/recent-runs";
import { formatUsd } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/session";
import type { RunFilter } from "@/server/repositories/repost-runs";
import { getHistoryPageData, HISTORY_PAGE_SIZE } from "@/server/services/history";

const FILTERS: { value: RunFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reposted", label: "Reposted" },
  { value: "problems", label: "Problems" },
];

const OPERATION_LABELS: Record<string, string> = {
  repost: "Reposts",
  undoRepost: "Undo Reposts",
  ownedPostRead: "Reading your posts",
  postRead: "Reading single / quoted posts",
  userRead: "Reading your profile",
  "users.me": "Connecting X",
};

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const { workspace } = await requireWorkspace();
  const { filter: rawFilter } = await searchParams;
  const filter = FILTERS.find((item) => item.value === rawFilter)?.value ?? "all";
  const data = await getHistoryPageData(workspace.id, filter);
  const { budget } = data;
  const usedPercent = Math.min(
    100,
    (Number(budget.spentMicros) / Number(budget.budgetMicros)) * 100,
  );

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-foreground/70 text-sm">
          Every scheduled Repost and this month’s API spend. Spend is an estimate that mirrors X’s
          billing (each read resource is billed once per UTC day); the X Developer Console is the
          source of truth.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Reposted", data.monthCounts.SUCCEEDED],
          ["Skipped", data.monthCounts.SKIPPED],
          ["Failed", data.monthCounts.FAILED],
          ["Check on X", data.monthCounts.UNKNOWN],
        ].map(([label, value]) => (
          <div key={label} className="border-foreground/10 rounded-lg border p-3">
            <p className="text-foreground/60 text-xs">{label} this month</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">API spend this month</h2>
          <p className="text-sm tabular-nums">
            {formatUsd(budget.spentMicros)} of {formatUsd(budget.budgetMicros)}
          </p>
        </div>
        <div
          className="bg-foreground/10 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={Math.round(usedPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full ${data.level === "exhausted" ? "bg-red-500" : data.level === "warning" ? "bg-amber-500" : "bg-green-600"}`}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        {data.spend.length === 0 ? (
          <p className="text-foreground/60 text-sm">No API calls this month yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-foreground/60 text-left text-xs">
              <tr>
                <th className="py-1 font-normal">Operation</th>
                <th className="py-1 text-right font-normal">Calls</th>
                <th className="py-1 text-right font-normal">Billed items</th>
                <th className="py-1 text-right font-normal">Estimate</th>
              </tr>
            </thead>
            <tbody className="divide-foreground/10 divide-y">
              {data.spend.map((row) => (
                <tr key={row.operation}>
                  <td className="py-1.5">{OPERATION_LABELS[row.operation] ?? row.operation}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.calls}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.billedUnits}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatUsd(row.costMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <BudgetForm dollars={Number(budget.budgetMicros) / 1_000_000} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Reposts</h2>
          <nav className="flex gap-1 text-sm" aria-label="Filter reposts">
            {FILTERS.map((item) => (
              <Link
                key={item.value}
                href={item.value === "all" ? "/history" : `/history?filter=${item.value}`}
                aria-current={filter === item.value ? "page" : undefined}
                className={`rounded-md px-3 py-1 ${filter === item.value ? "bg-foreground text-background" : "hover:bg-foreground/5"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <RecentRuns runs={data.runs} timeZone={workspace.timezone} />
        {data.runs.length === HISTORY_PAGE_SIZE && (
          <p className="text-foreground/60 text-xs">Showing the latest {HISTORY_PAGE_SIZE}.</p>
        )}
      </section>
    </>
  );
}
