import Link from "next/link";
import { DeleteAccountForm } from "@/features/account/delete-account-form";
import { DailyBars } from "@/features/dashboard/daily-bars";
import { RecentRuns } from "@/features/schedule/recent-runs";
import { formatDay, formatTime, SKIP_LABELS } from "@/features/schedule/labels";
import { XAccountCard } from "@/features/x-account/x-account-card";
import { formatUsd } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/session";
import { findConnection } from "@/server/repositories/x-accounts";
import { getDashboardData } from "@/server/services/dashboard";

const STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: "reposted",
  SKIPPED: "skipped",
  FAILED: "failed",
  UNKNOWN: "to check",
  PROCESSING: "running",
};

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { workspace, role } = await requireWorkspace();
  const isAdmin = role === "SUPERADMIN";
  const [connection, query, data] = await Promise.all([
    findConnection(workspace.id),
    searchParams,
    getDashboardData(workspace, role),
  ]);
  const tz = workspace.timezone;
  const days = data.chart.days.map((day) => ({ day, label: dayLabel(day) }));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-foreground/70 text-sm">Times in {tz}.</p>
      </div>

      {data.attention.length > 0 && (
        <section aria-label="Needs attention" className="flex flex-col gap-2">
          {data.attention.map((item) => (
            <div
              key={item.message}
              role="alert"
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                item.tone === "red"
                  ? "bg-red-500/10 text-red-800 dark:text-red-300"
                  : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
              }`}
            >
              <span>{item.message}</span>
              <Link href={item.href} className="font-medium underline underline-offset-2">
                {item.action}
              </Link>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="border-foreground/10 flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-medium">Next Repost batch</h2>
          {!data.scheduleActive ? (
            <p className="text-foreground/60 text-sm">
              The schedule is off.{" "}
              <Link href="/schedule" className="underline underline-offset-2">
                Open schedule
              </Link>
            </p>
          ) : data.nextBatch ? (
            <>
              <p className="text-sm">
                <strong>
                  {formatDay(data.nextBatch.runAt, tz)}, {formatTime(data.nextBatch.runAt, tz)}
                </strong>
              </p>
              <ol className="flex flex-col gap-1 text-sm">
                {data.nextBatch.items.map((item, index) => (
                  <li key={item.key} className="flex gap-2">
                    <span className="text-foreground/50 tabular-nums">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    {item.skipReason && (
                      <span className="text-foreground/50 shrink-0 text-xs">
                        {SKIP_LABELS[item.skipReason as keyof typeof SKIP_LABELS] ?? "skipped"}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-foreground/60 text-sm">Nothing planned in the next 48 hours.</p>
          )}
          {data.lastBatch && (
            <p className="text-foreground/60 border-foreground/10 mt-1 border-t pt-2 text-xs">
              Last batch {formatDay(data.lastBatch.runAt, tz)},{" "}
              {formatTime(data.lastBatch.runAt, tz)}:{" "}
              {Object.entries(data.lastBatch.counts)
                .map(([status, count]) => `${count} ${STATUS_LABELS[status] ?? status}`)
                .join(" · ")}
            </p>
          )}
        </section>

        <section className="border-foreground/10 flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="font-medium">Today</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Replies" value={`${data.today.replies}/${data.today.repliesLimit}`} />
            <Stat
              label="Target loads"
              value={
                data.today.targetLoadsLimit === null
                  ? String(data.today.targetLoads)
                  : `${data.today.targetLoads}/${data.today.targetLoadsLimit}`
              }
            />
            <Stat label="AI idea requests" value={String(data.today.aiIdeas)} />
            {isAdmin && data.today.spendMicros !== null && data.budget && (
              <Stat
                label="API spend (estimate)"
                value={formatUsd(data.today.spendMicros)}
                hint={`${formatUsd(data.budget.spentMicros)} of ${formatUsd(data.budget.budgetMicros)} this month`}
              />
            )}
          </dl>
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <DailyBars
          title="Reposts per day"
          legend={[
            { className: "bg-green-600", label: "Reposted" },
            { className: "bg-foreground/25", label: "Skipped" },
            { className: "bg-red-500", label: "Failed / to check" },
          ]}
          days={days.map((day, index) => {
            const value = data.chart.reposts[index] ?? { succeeded: 0, skipped: 0, problems: 0 };
            return {
              ...day,
              segments: [
                { value: value.succeeded, className: "bg-green-600", label: "Reposted" },
                { value: value.skipped, className: "bg-foreground/25", label: "Skipped" },
                { value: value.problems, className: "bg-red-500", label: "Failed / to check" },
              ],
            };
          })}
        />
        <DailyBars
          title="Replies opened per day"
          legend={[{ className: "bg-blue-500", label: "Replies" }]}
          days={days.map((day, index) => ({
            ...day,
            segments: [
              { value: data.chart.replies[index] ?? 0, className: "bg-blue-500", label: "Replies" },
            ],
          }))}
        />
        {data.chart.spendMicros && (
          <DailyBars
            title="API spend per day (estimate)"
            legend={[{ className: "bg-foreground/70", label: "Spend" }]}
            format={(micros) => formatUsd(BigInt(Math.round(micros)))}
            days={days.map((day, index) => ({
              ...day,
              segments: [
                {
                  value: Number(data.chart.spendMicros?.[index] ?? 0n),
                  className: "bg-foreground/70",
                  label: "Spend",
                },
              ],
            }))}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">Recent Reposts</h2>
          <Link href="/history" className="text-sm underline underline-offset-2">
            All history
          </Link>
        </div>
        <RecentRuns runs={data.recentRuns} timeZone={tz} />
      </section>

      <div id="x-account">
        <XAccountCard
          connection={connection}
          status={typeof query.x === "string" ? query.x : undefined}
          error={typeof query.x_error === "string" ? query.x_error : undefined}
        />
      </div>

      {!isAdmin && (
        <section className="flex flex-col gap-3 rounded-lg border border-red-500/30 p-4">
          <h2 className="text-lg font-medium">Delete account</h2>
          <DeleteAccountForm />
        </section>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-foreground/60 text-xs">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-foreground/60 text-xs">{hint}</dd>}
    </div>
  );
}
