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
import { MIN_INTERVAL_HOUR_OPTIONS, SCHEDULE_TIMEZONES } from "@/server/domain/repost-rules";
import { USER_REPOST_INTERVAL_MINUTES } from "@/server/domain/user-limits";
import { getSchedulePageData, PREVIEW_HOURS, slotCap } from "@/server/services/schedule";

export default async function SchedulePage() {
  const { workspace, role } = await requireWorkspace();
  const showCosts = role === "SUPERADMIN";
  const now = new Date();
  const [data, maxTimes] = await Promise.all([
    getSchedulePageData(workspace, now),
    slotCap(workspace.id),
  ]);
  // Users have a fixed 1 h interval (D-027).
  const intervalMinutes = showCosts
    ? workspace.perPostMinIntervalMinutes
    : USER_REPOST_INTERVAL_MINUTES;
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
              ({data.slots.length}/{maxTimes})
            </span>
          </h2>
          <p className="text-foreground/70 text-sm">
            At each time, every day of the schedule, <strong>all posts</strong> in your{" "}
            <Link href="/posts" className="underline underline-offset-2">
              repost list
            </Link>{" "}
            ({data.listSize} posts) are reposted in list order, first to last — the last one ends up
            on top of your timeline.
          </p>
        </div>
        <SlotList slots={data.slots} workspaceTimezone={tz} now={now} listSize={data.listSize} />
        {data.minGapMinutes !== null && data.minGapMinutes < intervalMinutes && (
          <p
            role="alert"
            className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
          >
            Two of your times are only {Math.floor(data.minGapMinutes / 60)} h{" "}
            {data.minGapMinutes % 60} min apart, but a post can be reposted at most every{" "}
            {intervalMinutes / 60} h — the later batch will be skipped. Space the times further
            apart{showCosts && " or lower the interval below"}.
          </p>
        )}
        <AddSlotForm
          timezones={SCHEDULE_TIMEZONES}
          defaultTimezone={tz}
          disabled={data.slots.length >= maxTimes}
          listSize={data.listSize}
        />
      </section>

      {showCosts ? (
        <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Interval & cost</h2>
          <LimitsForm
            intervalHours={workspace.perPostMinIntervalMinutes / 60}
            intervalOptions={MIN_INTERVAL_HOUR_OPTIONS}
          />
          <p
            className={`text-sm ${overBudget ? "text-amber-700 dark:text-amber-400" : "text-foreground/70"}`}
          >
            {data.slots.length} times × {data.listSize} posts = {data.estimate.repostsPerDay}{" "}
            Reposts/day ≈ {formatUsd(BigInt(data.estimate.perDayMicros))}/day ≈{" "}
            {formatUsd(BigInt(data.estimate.perMonthMicros))}/month (estimate, each = undo +
            Repost). Monthly budget {formatUsd(data.budget.budgetMicros)}, spent{" "}
            {formatUsd(data.budget.spentMicros)}.
            {overBudget &&
              " Over budget: once the budget is used up, remaining Reposts this month are skipped."}
          </p>
        </section>
      ) : (
        <p className="text-foreground/70 text-sm">
          {data.slots.length} times × {data.listSize} posts = {data.estimate.repostsPerDay} Reposts
          per day. Each post is reposted at most once per hour, so keep your times at least 1 hour
          apart.
        </p>
      )}

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
