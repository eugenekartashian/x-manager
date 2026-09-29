// Pure Repost planner: turns the schedule, daily times, repost list and interval into
// concrete Reposts (or the reason each one is skipped). Shared by the schedule preview
// and the job processor, so the preview shows exactly what will run.
//
// Model (D-017, D-018): at every daily time (max 8 per day), EVERY post in the repost list
// is reposted. The batch runs in list order (D-023): the first post is reposted first, so
// the last one ends up on top of the timeline. The only per-post limit is the minimum interval between its Reposts.

import { addDays, localDateOf, zonedToUtc, type LocalDate, type LocalTime } from "@/lib/zoned-time";

export type PlanSlot = { id: string; localTime: LocalTime; timezone: string };

export type PlanSchedule = { active: boolean; startDate: LocalDate; durationDays: number | null };

export type PlanPost = { id: string; lastRepostedAt: Date | null };

export type PlanInput = {
  schedule: PlanSchedule;
  slots: PlanSlot[];
  /** Repost list in display order (first = reposted first). */
  list: PlanPost[];
  /** A post is reposted at most once per this interval (our anti-spam rule, D-018). */
  limits: { minIntervalMs: number };
  /** Reposts already recorded — their effects are in the state above, so skip them. */
  skipKeys?: ReadonlySet<string>;
  from: Date;
  to: Date;
};

export type SkipReason =
  | "empty_list" // repost list is empty
  | "interval"; // this post was reposted too recently

export type PlannedRepost = {
  /** Stable per time, local date and post — used as the job dedupe key. */
  key: string;
  /** Stable per time and local date — groups one batch. */
  batchKey: string;
  slotId: string;
  runAt: Date;
  localDate: LocalDate;
  localTime: LocalTime;
  timezone: string;
  postId: string | null;
  skipReason: SkipReason | null;
};

export function batchKey(slotId: string, localDate: LocalDate): string {
  return `${slotId}:${localDate}`;
}

export function repostKey(slotId: string, localDate: LocalDate, postId: string | null): string {
  return `${batchKey(slotId, localDate)}:${postId ?? "empty"}`;
}

export function scheduleEndDate(schedule: PlanSchedule): LocalDate | null {
  return schedule.durationDays === null
    ? null
    : addDays(schedule.startDate, schedule.durationDays - 1);
}

/** Occurrences of every daily time with runAt in [from, to), within the schedule's dates. */
export function occurrences(input: Pick<PlanInput, "schedule" | "slots" | "from" | "to">) {
  const { schedule, slots, from, to } = input;
  if (!schedule.active) return [];
  const end = scheduleEndDate(schedule);
  const result: { slot: PlanSlot; localDate: LocalDate; runAt: Date }[] = [];

  for (const slot of slots) {
    // Local dates that can contain an instant in [from, to) for this timezone.
    const first = addDays(localDateOf(from, slot.timezone), -1);
    const last = addDays(localDateOf(to, slot.timezone), 1);
    for (let date = first; date <= last; date = addDays(date, 1)) {
      if (date < schedule.startDate || (end !== null && date > end)) continue;
      const runAt = zonedToUtc(date, slot.localTime, slot.timezone);
      if (runAt >= from && runAt < to) result.push({ slot, localDate: date, runAt });
    }
  }
  return result.sort(
    (a, b) => a.runAt.getTime() - b.runAt.getTime() || a.slot.id.localeCompare(b.slot.id),
  );
}

export function planReposts(input: PlanInput): PlannedRepost[] {
  const lastReposted = new Map(input.list.map((post) => [post.id, post.lastRepostedAt]));
  const batchOrder = input.list;
  const planned: PlannedRepost[] = [];

  for (const { slot, localDate, runAt } of occurrences(input)) {
    const base = {
      batchKey: batchKey(slot.id, localDate),
      slotId: slot.id,
      runAt,
      localDate,
      localTime: slot.localTime,
      timezone: slot.timezone,
    };

    if (batchOrder.length === 0) {
      const key = repostKey(slot.id, localDate, null);
      if (!input.skipKeys?.has(key))
        planned.push({ ...base, key, postId: null, skipReason: "empty_list" });
      continue;
    }

    for (const post of batchOrder) {
      const key = repostKey(slot.id, localDate, post.id);
      if (input.skipKeys?.has(key)) continue;

      const last = lastReposted.get(post.id) ?? null;
      const skipReason: SkipReason | null =
        last && runAt.getTime() - last.getTime() < input.limits.minIntervalMs ? "interval" : null;
      if (!skipReason) lastReposted.set(post.id, runAt);
      planned.push({ ...base, key, postId: post.id, skipReason });
    }
  }
  return planned;
}
