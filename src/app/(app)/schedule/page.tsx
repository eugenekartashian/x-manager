import Link from "next/link";
import { AddSlotForm } from "@/features/schedule/add-slot-form";
import { ConnectXFirst } from "@/features/x-account/connect-x-first";
import { LimitsForm } from "@/features/schedule/limits-form";
import { PreviewList } from "@/features/schedule/preview-list";
import { RecentRuns } from "@/features/schedule/recent-runs";
import { ScheduleForm } from "@/features/schedule/schedule-form";
import { SlotList } from "@/features/schedule/slot-list";
import { formatUsd } from "@/lib/format";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/server/auth/session";
import {
  HARD_MAX_REPOSTS_PER_DAY,
  MAX_SLOTS,
  MIN_INTERVAL_HOUR_OPTIONS,
  SCHEDULE_TIMEZONES,
} from "@/server/domain/repost-rules";
import { getSchedulePageData, PREVIEW_HOURS } from "@/server/services/schedule";

export default async function SchedulePage() {
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const data = await getSchedulePageData(workspace, now);
  const tz = workspace.timezone;
  const overBudget = BigInt(data.estimate.perMonthMicros) > data.budget.budgetMicros;

  if (!data.connected) {
    return (
      <ConnectXFirst
        title="Schedule"
        message="Connect your X account first — the schedule reposts posts from your X account."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-foreground/70 text-sm">
          Daily times for automatic Reposts of your own posts. Times run with about ±5 minutes
          precision once deployed.
        </p>
      </div>

      {!env.X_WRITES_ENABLED && (
        <p
          role="status"
          className="rounded-md bg-blue-500/10 px-3 py-2 text-sm text-blue-800 dark:text-blue-300"
        >
          Live Reposts are OFF (dry run): the scheduler only records what it would repost. They are
          switched on for the first live test, with your approval.
        </p>
      )}

      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-medium">Dates</h2>
        <ScheduleForm
          active={data.schedule.active}
          startDate={data.schedule.startDate}
          durationDays={data.schedule.durationDays}
          timeZone={tz}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">
            Daily times{" "}
            <span className="text-foreground/50">
              ({data.slots.length}/{MAX_SLOTS})
            </span>
          </h2>
          <p className="text-foreground/70 text-sm">
            Each time runs every day of the schedule and reposts the next post from your{" "}
            <Link href="/posts" className="underline underline-offset-2">
              repost list
            </Link>{" "}
            ({data.listSize} posts) in order.
          </p>
        </div>
        <SlotList slots={data.slots} workspaceTimezone={tz} now={now} />
        <AddSlotForm
          timezones={SCHEDULE_TIMEZONES}
          defaultTimezone={tz}
          disabled={data.slots.length >= MAX_SLOTS}
          listSize={data.listSize}
        />
      </section>

      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-medium">Limits & cost</h2>
        <LimitsForm
          intervalHours={workspace.perPostMinIntervalMinutes / 60}
          dailyCap={workspace.dailyRepostCap}
          intervalOptions={MIN_INTERVAL_HOUR_OPTIONS}
          maxCap={HARD_MAX_REPOSTS_PER_DAY}
        />
        <p
          className={`text-sm ${overBudget ? "text-amber-700 dark:text-amber-400" : "text-foreground/70"}`}
        >
          {data.estimate.repostsPerDay} Reposts/day ≈{" "}
          {formatUsd(BigInt(data.estimate.perDayMicros))}/day ≈{" "}
          {formatUsd(BigInt(data.estimate.perMonthMicros))}/month (estimate, each = undo + Repost).
          Monthly budget {formatUsd(data.budget.budgetMicros)}, spent{" "}
          {formatUsd(data.budget.spentMicros)}.
          {overBudget &&
            " Over budget: once the budget is used up, remaining Reposts this month are skipped."}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">Next {PREVIEW_HOURS} hours</h2>
          <p className="text-foreground/70 text-sm">
            What the scheduler will do next, based on your list, limits and today’s runs.
          </p>
        </div>
        <PreviewList items={data.preview} workspaceTimezone={tz} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent runs</h2>
        <RecentRuns runs={data.recentRuns} timeZone={tz} />
      </section>
    </>
  );
}
