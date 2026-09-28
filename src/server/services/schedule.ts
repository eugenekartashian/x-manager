import "server-only";
import type { OwnPost, RepostSchedule } from "@/generated/prisma/client";
import { err, ok, type Result } from "@/lib/result";
import { isLocalDate, isLocalTime, localDateOf } from "@/lib/zoned-time";
import {
  planReposts,
  type PlannedRepost,
  type PlanPost,
  type PlanSlot,
} from "@/server/domain/repost-plan";
import {
  HARD_MAX_REPOSTS_PER_DAY,
  isScheduleTimezone,
  MAX_SLOTS,
  MIN_INTERVAL_HOUR_OPTIONS,
  REPOST_PAIR_COST_MICROS,
} from "@/server/domain/repost-rules";
import * as posts from "@/server/repositories/own-posts";
import * as schedules from "@/server/repositories/schedules";
import { getBudgetStatus, type BudgetStatus } from "@/server/services/budget";
import { connectedXUserId } from "@/server/services/x-api";

export const PREVIEW_HOURS = 48;
const MAX_DURATION_DAYS = 366;

type WorkspaceRef = {
  id: string;
  timezone: string;
  perPostMinIntervalMinutes: number;
  dailyRepostCap: number;
};

// ─── Page data ───────────────────────────────────────────────────────────────

export type SchedulePageData = {
  schedule: RepostSchedule;
  slots: schedules.SlotWithPost[];
  pinned: OwnPost | null;
  listSize: number;
  preview: (PlannedRepost & { post: OwnPost | null })[];
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
  const [slots, budget, xUserId] = await Promise.all([
    schedules.listSlots(workspace.id),
    getBudgetStatus(workspace.id, now),
    connectedXUserId(workspace.id),
  ]);

  const scope = xUserId.ok ? { workspaceId: workspace.id, xUserId: xUserId.data } : null;
  const [list, pinned] = scope
    ? await Promise.all([posts.listRotation(scope), posts.findPinned(scope)])
    : [[], null];
  // Slot-chosen posts outside the current X account's scope are treated as missing.
  const slotPosts = slots
    .map((slot) => slot.ownPost)
    .filter(
      (post): post is OwnPost => post !== null && scope !== null && post.xUserId === scope.xUserId,
    );

  const byId = new Map<string, OwnPost>();
  for (const post of [...list, ...slotPosts, ...(pinned ? [pinned] : [])]) byId.set(post.id, post);

  const plan = planReposts({
    schedule,
    slots: slots.map(toPlanSlot),
    list: list.map(toPlanPost),
    pinned: pinned ? toPlanPost(pinned) : null,
    posts: slotPosts.map(toPlanPost),
    listCursorPostId: schedule.listCursorPostId,
    limits: {
      minIntervalMs: workspace.perPostMinIntervalMinutes * 60_000,
      dailyCap: workspace.dailyRepostCap,
    },
    workspaceTimezone: workspace.timezone,
    from: now,
    to: new Date(now.getTime() + PREVIEW_HOURS * 3_600_000),
  });

  const repostsPerDay = Math.min(slots.length, workspace.dailyRepostCap);
  const perDayMicros = repostsPerDay * REPOST_PAIR_COST_MICROS;

  return {
    schedule,
    slots,
    pinned,
    listSize: list.length,
    preview: plan.map((item) => ({
      ...item,
      post: item.postId ? (byId.get(item.postId) ?? null) : null,
    })),
    estimate: { repostsPerDay, perDayMicros, perMonthMicros: perDayMicros * 30 },
    budget,
    connected: scope !== null,
  };
}

function toPlanSlot(slot: schedules.SlotWithPost): PlanSlot {
  const target =
    slot.target === "PINNED"
      ? ({ kind: "pinned" } as const)
      : slot.target === "POST"
        ? ({ kind: "post", ownPostId: slot.ownPostId } as const)
        : ({ kind: "next" } as const);
  return { id: slot.id, localTime: slot.localTime, timezone: slot.timezone, target };
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

/** Adds a daily time. Every time reposts the next post from the repost list (D-013). */
export async function addSlot(
  workspace: WorkspaceRef,
  input: { localTime: string; timezone: string },
  now = new Date(),
): Promise<Result<null, SlotError>> {
  if (!isLocalTime(input.localTime)) return err("invalid_time");
  if (!isScheduleTimezone(input.timezone)) return err("invalid_timezone");
  if ((await schedules.countSlots(workspace.id)) >= MAX_SLOTS) return err("too_many_slots");

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

export type LimitsError = "invalid_interval" | "invalid_cap";

export async function saveRepostLimits(
  workspaceId: string,
  input: { minIntervalHours: number; dailyCap: number },
): Promise<Result<null, LimitsError>> {
  if (!(MIN_INTERVAL_HOUR_OPTIONS as readonly number[]).includes(input.minIntervalHours)) {
    return err("invalid_interval");
  }
  if (
    !Number.isInteger(input.dailyCap) ||
    input.dailyCap < 1 ||
    input.dailyCap > HARD_MAX_REPOSTS_PER_DAY
  ) {
    return err("invalid_cap");
  }
  await schedules.updateRepostLimits(workspaceId, {
    perPostMinIntervalMinutes: input.minIntervalHours * 60,
    dailyRepostCap: input.dailyCap,
  });
  return ok(null);
}
