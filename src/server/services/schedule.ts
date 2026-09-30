import "server-only";
import type { OwnPost, RepostSchedule } from "@/generated/prisma/client";
import { err, ok, type Result } from "@/lib/result";
import { isLocalDate, isLocalTime, localDateOf, zonedToUtc } from "@/lib/zoned-time";
import { planReposts, type PlannedRepost, type PlanPost } from "@/server/domain/repost-plan";
import { capToLimits } from "@/server/domain/user-limits";
import {
  isScheduleTimezone,
  MAX_SLOTS,
  MIN_INTERVAL_HOUR_OPTIONS,
  REPOST_PAIR_COST_MICROS,
} from "@/server/domain/repost-rules";
import * as posts from "@/server/repositories/own-posts";
import * as runs from "@/server/repositories/repost-runs";
import * as schedules from "@/server/repositories/schedules";
import { getBudgetStatus, type BudgetStatus } from "@/server/services/budget";
import { getLimits } from "@/server/services/limits";
import { connectedXUserId } from "@/server/services/x-api";

export const PREVIEW_HOURS = 48;
const MAX_DURATION_DAYS = 366;

type WorkspaceRef = {
  id: string;
  timezone: string;
  perPostMinIntervalMinutes: number;
};

// ─── Page data ───────────────────────────────────────────────────────────────

export type SchedulePageData = {
  schedule: RepostSchedule;
  slots: schedules.SlotWithPost[];
  listSize: number;
  preview: (PlannedRepost & { post: OwnPost | null })[];
  recentRuns: Awaited<ReturnType<typeof runs.listRecentRuns>>;
  /** Smallest gap between daily times; below the per-post interval, batches get skipped. */
  minGapMinutes: number | null;
  estimate: { repostsPerDay: number; perDayMicros: number; perMonthMicros: number };
  budget: BudgetStatus;
  connected: boolean;
};

export async function getSchedulePageData(
  workspace: WorkspaceRef,
  now = new Date(),
): Promise<SchedulePageData> {
  const schedule = await schedules.getOrCreateSchedule(
    workspace.id,
    localDateOf(now, workspace.timezone),
  );
  const [allSlots, budget, xUserId, limits] = await Promise.all([
    schedules.listSlots(workspace.id),
    getBudgetStatus(workspace.id, now),
    connectedXUserId(workspace.id),
    getLimits(workspace.id),
  ]);

  const scope = xUserId.ok ? { workspaceId: workspace.id, xUserId: xUserId.data } : null;
  const [fullList, recentRuns] = await Promise.all([
    scope ? posts.listRotation(scope) : Promise.resolve([]),
    runs.listRecentRuns(workspace.id, 10),
  ]);
  // Same caps as the job: posts/times beyond the user's limits never run (M6.3).
  const { list, slots } = capToLimits(fullList, allSlots, limits);
  const byId = new Map(list.map((post) => [post.id, post]));

  // Same inputs as the job processor, so the preview shows what will actually run.
  const plan = planReposts({
    schedule,
    slots: slots.map((slot) => ({
      id: slot.id,
      localTime: slot.localTime,
      timezone: slot.timezone,
    })),
    list: list.map(toPlanPost),
    limits: { minIntervalMs: workspace.perPostMinIntervalMinutes * 60_000 },
    skipKeys: await runs.recordedKeys(workspace.id, now),
    from: now,
    to: new Date(now.getTime() + PREVIEW_HOURS * 3_600_000),
  });

  // Every daily time reposts the whole list (D-017, D-018).
  const repostsPerDay = slots.length * list.length;
  const perDayMicros = repostsPerDay * REPOST_PAIR_COST_MICROS;

  return {
    schedule,
    slots,
    listSize: list.length,
    preview: plan.map((item) => ({
      ...item,
      post: item.postId ? (byId.get(item.postId) ?? null) : null,
    })),
    recentRuns,
    estimate: { repostsPerDay, perDayMicros, perMonthMicros: perDayMicros * 30 },
    minGapMinutes: minGapBetweenTimes(slots, now),
    budget,
    connected: scope !== null,
  };
}

/** Smallest gap between two daily times (wrapping over midnight), in minutes. */
export function minGapBetweenTimes(
  slots: { localTime: string; timezone: string }[],
  now: Date,
): number | null {
  if (slots.length < 2) return null;
  const minutes = slots
    .map((slot) => {
      const at = zonedToUtc(localDateOf(now, slot.timezone), slot.localTime, slot.timezone);
      return (at.getUTCHours() * 60 + at.getUTCMinutes()) % 1440;
    })
    .sort((a, b) => a - b);
  const gaps = minutes.map((value, index) =>
    index === 0 ? value + 1440 - (minutes.at(-1) ?? value) : value - (minutes[index - 1] ?? value),
  );
  return Math.min(...gaps);
}

function toPlanPost(post: OwnPost): PlanPost {
  return { id: post.id, lastRepostedAt: post.lastRepostedAt };
}

// ─── Edits ───────────────────────────────────────────────────────────────────

export type ScheduleError = "invalid_date" | "invalid_duration";

export async function saveSchedule(
  workspace: WorkspaceRef,
  input: { active: boolean; startDate: string; durationDays: number | null },
): Promise<Result<RepostSchedule, ScheduleError>> {
  if (!isLocalDate(input.startDate)) return err("invalid_date");
  if (
    input.durationDays !== null &&
    (!Number.isInteger(input.durationDays) ||
      input.durationDays < 1 ||
      input.durationDays > MAX_DURATION_DAYS)
  ) {
    return err("invalid_duration");
  }
  await schedules.getOrCreateSchedule(workspace.id, input.startDate);
  return ok(await schedules.updateSchedule(workspace.id, input));
}

export type SlotError = "invalid_time" | "invalid_timezone" | "too_many_slots";

/** App-wide cap, or the user's own limit when it is lower (M6.3). */
export async function slotCap(workspaceId: string): Promise<number> {
  const limits = await getLimits(workspaceId);
  return Math.min(MAX_SLOTS, limits?.dailyTimes ?? MAX_SLOTS);
}

/** Adds a daily time. Every time reposts the next post from the repost list (D-013). */
export async function addSlot(
  workspace: WorkspaceRef,
  input: { localTime: string; timezone: string },
  now = new Date(),
): Promise<Result<null, SlotError>> {
  if (!isLocalTime(input.localTime)) return err("invalid_time");
  if (!isScheduleTimezone(input.timezone)) return err("invalid_timezone");
  if ((await schedules.countSlots(workspace.id)) >= (await slotCap(workspace.id))) {
    return err("too_many_slots");
  }

  const schedule = await schedules.getOrCreateSchedule(
    workspace.id,
    localDateOf(now, workspace.timezone),
  );
  await schedules.createSlot(workspace.id, schedule.id, {
    localTime: input.localTime,
    timezone: input.timezone,
    target: "NEXT_FROM_LIST",
    ownPostId: null,
  });
  return ok(null);
}

export async function removeSlot(
  workspaceId: string,
  slotId: string,
): Promise<Result<null, "not_found">> {
  return (await schedules.deleteSlot(workspaceId, slotId)) ? ok(null) : err("not_found");
}

export async function saveRepostInterval(
  workspaceId: string,
  input: { minIntervalHours: number },
): Promise<Result<null, "invalid_interval">> {
  if (!(MIN_INTERVAL_HOUR_OPTIONS as readonly number[]).includes(input.minIntervalHours)) {
    return err("invalid_interval");
  }
  await schedules.updateRepostInterval(workspaceId, input.minIntervalHours * 60);
  return ok(null);
}
