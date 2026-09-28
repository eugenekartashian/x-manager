import Link from "next/link";
import { AddSlotForm } from "@/features/schedule/add-slot-form";
import { formatDay } from "@/features/schedule/labels";
import { LimitsForm } from "@/features/schedule/limits-form";
import { PreviewList } from "@/features/schedule/preview-list";
import { ScheduleForm } from "@/features/schedule/schedule-form";
import { SlotList } from "@/features/schedule/slot-list";
import { formatUsd } from "@/lib/format";
import { zonedToUtc } from "@/lib/zoned-time";
import { requireWorkspace } from "@/server/auth/session";
import { scheduleEndDate } from "@/server/domain/repost-plan";
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
  const end = scheduleEndDate(data.schedule);
  const overBudget = BigInt(data.estimate.perMonthMicros) > data.budget.budgetMicros;
  const dayLabel = (date: string) => formatDay(zonedToUtc(date, "12:00", tz), tz);

  const postOptions = data.choosablePosts.map((post) => {
    const text = post.text.replace(/\s+/g, " ").trim() || "(media only)";
    return {
      value: post.id,
      label: `${post.isPinned ? "📌 " : ""}${text.slice(0, 50)}${text.length > 50 ? "…" : ""}`,
    };
  });

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-foreground/70 text-sm">
          Daily times for automatic Reposts of your own posts. Times run with about ±5 minutes
          precision once deployed.
        </p>
        {!data.connected && (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            X is not connected — nothing will be reposted.{" "}
            <Link href="/dashboard" className="underline">
              Connect X
            </Link>
          </p>
        )}
      </div>

      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-medium">Dates</h2>
        <ScheduleForm
          active={data.schedule.active}
          startDate={data.schedule.startDate}
          durationDays={data.schedule.durationDays}
        />
        <p className="text-foreground/70 text-sm">
          {data.schedule.active ? "Runs" : "Would run"} from {dayLabel(data.schedule.startDate)}{" "}
          {end ? `to ${dayLabel(end)} (${data.schedule.durationDays} days)` : "with no end date"}.
        </p>
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
            Each time runs every day of the schedule. “Next from repost list” takes your{" "}
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
          posts={postOptions}
          disabled={data.slots.length >= MAX_SLOTS}
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
            Preview only — Reposts are not executed yet (coming in the next step).
          </p>
        </div>
        <PreviewList items={data.preview} workspaceTimezone={tz} />
      </section>
    </>
  );
}
