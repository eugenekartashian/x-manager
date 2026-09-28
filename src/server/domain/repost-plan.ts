// Pure Repost planner: turns the schedule, slots, repost list and limits into
// concrete occurrences with the post each one will repost (or why it is skipped).
// Shared by the schedule preview (M2.3) and the job processor (M2.4).

import { addDays, localDateOf, zonedToUtc, type LocalDate, type LocalTime } from "@/lib/zoned-time";

export type SlotTarget =
  { kind: "pinned" } | { kind: "post"; ownPostId: string | null } | { kind: "next" };

export type PlanSlot = { id: string; localTime: LocalTime; timezone: string; target: SlotTarget };

export type PlanSchedule = { active: boolean; startDate: LocalDate; durationDays: number | null };

export type PlanPost = { id: string; lastRepostedAt: Date | null };

export type PlanInput = {
  schedule: PlanSchedule;
  slots: PlanSlot[];
  /** Repost list in order. */
  list: PlanPost[];
  /** Currently pinned post, if known locally. */
  pinned: PlanPost | null;
  /** Other posts a slot may point to directly. */
  posts: PlanPost[];
  /** Last post taken from the list; "next" continues after it. */
  listCursorPostId: string | null;
  limits: { minIntervalMs: number; dailyCap: number };
  /** Daily cap is counted per local day in this timezone. */
  workspaceTimezone: string;
  /** Reposts already done per workspace-local day (from history). */
  doneByDay?: ReadonlyMap<LocalDate, number>;
  /** Occurrences already recorded — their effects are in the state above, so skip them. */
  skipKeys?: ReadonlySet<string>;
  from: Date;
  to: Date;
};

export type SkipReason =
  | "no_pinned" // nothing pinned (or pinned post not loaded yet)
  | "no_post" // slot's chosen post was removed
  | "empty_list" // repost list is empty
  | "interval" // every candidate was reposted too recently
  | "daily_cap"; // daily limit reached

export type PlannedRepost = {
  /** Stable per slot and local date — used as the job dedupe key. */
  key: string;
  slotId: string;
  runAt: Date;
  localDate: LocalDate;
  localTime: LocalTime;
  timezone: string;
  target: SlotTarget["kind"];
  postId: string | null;
  skipReason: SkipReason | null;
};

export function occurrenceKey(slotId: string, localDate: LocalDate): string {
  return `${slotId}:${localDate}`;
}

export function scheduleEndDate(schedule: PlanSchedule): LocalDate | null {
  return schedule.durationDays === null
    ? null
    : addDays(schedule.startDate, schedule.durationDays - 1);
}

/** Occurrences of every slot with runAt in [from, to), within the schedule's date range. */
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
  const lastReposted = new Map<string, Date | null>();
  for (const post of [...input.list, ...input.posts, ...(input.pinned ? [input.pinned] : [])]) {
    lastReposted.set(post.id, post.lastRepostedAt);
  }
  const doneByDay = new Map(input.doneByDay ?? []);
  let cursor = input.listCursorPostId;

  const isCool = (postId: string, at: Date) => {
    const last = lastReposted.get(postId);
    return !last || at.getTime() - last.getTime() >= input.limits.minIntervalMs;
  };

  const pending = occurrences(input).filter(
    ({ slot, localDate }) => !input.skipKeys?.has(occurrenceKey(slot.id, localDate)),
  );

  return pending.map(({ slot, localDate, runAt }) => {
    const base = {
      key: occurrenceKey(slot.id, localDate),
      slotId: slot.id,
      runAt,
      localDate,
      localTime: slot.localTime,
      timezone: slot.timezone,
      target: slot.target.kind,
    };
    const skip = (skipReason: SkipReason, postId: string | null = null): PlannedRepost => ({
      ...base,
      postId,
      skipReason,
    });

    const day = localDateOf(runAt, input.workspaceTimezone);
    if ((doneByDay.get(day) ?? 0) >= input.limits.dailyCap) return skip("daily_cap");

    let postId: string;
    if (slot.target.kind === "pinned") {
      if (!input.pinned) return skip("no_pinned");
      postId = input.pinned.id;
      if (!isCool(postId, runAt)) return skip("interval", postId);
    } else if (slot.target.kind === "post") {
      if (!slot.target.ownPostId || !lastReposted.has(slot.target.ownPostId))
        return skip("no_post");
      postId = slot.target.ownPostId;
      if (!isCool(postId, runAt)) return skip("interval", postId);
    } else {
      if (input.list.length === 0) return skip("empty_list");
      const next = nextFromList(input.list, cursor, (id) => isCool(id, runAt));
      if (!next) return skip("interval");
      postId = next;
      cursor = next;
    }

    lastReposted.set(postId, runAt);
    doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
    return { ...base, postId, skipReason: null };
  });
}

/** First eligible post after the cursor, wrapping around the list once. */
function nextFromList(list: PlanPost[], cursor: string | null, eligible: (id: string) => boolean) {
  const start = cursor ? list.findIndex((post) => post.id === cursor) + 1 : 0;
  for (let step = 0; step < list.length; step++) {
    const post = list[(start + step) % list.length];
    if (post && eligible(post.id)) return post.id;
  }
  return null;
}
