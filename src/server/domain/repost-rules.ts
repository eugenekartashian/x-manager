// Repost limits (D-003, D-012). Workspace settings choose values within these bounds.
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";

/** Up to 8 daily times; each reposts the whole list (D-017, D-018). */
export const MAX_SLOTS = 8;
/**
 * Repost list size cap: a batch is undo + Repost per post, and X allows 50 of each per
 * user per 15 min (docs.x.com rate limits). 25 keeps one batch well inside that.
 */
export const MAX_LIST_SIZE = 25;
export const MIN_INTERVAL_HOUR_OPTIONS = [2, 3, 4, 5, 6, 8, 12] as const;
export const DEFAULT_MIN_INTERVAL_MINUTES = 120;

/** Each scheduled Repost = undo (if any) + Repost. */
export const REPOST_PAIR_COST_MICROS = X_PRICE_MICROS.undoRepost + X_PRICE_MICROS.repost;

export const SCHEDULE_TIMEZONES = [
  { value: "Europe/Madrid", label: "Madrid / Paris / Berlin" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "America/New_York", label: "New York (US East)" },
  { value: "America/Chicago", label: "Chicago (US Central)" },
  { value: "America/Denver", label: "Denver (US Mountain)" },
  { value: "America/Los_Angeles", label: "Los Angeles (US West)" },
  { value: "UTC", label: "UTC" },
] as const;

export function isScheduleTimezone(value: string): boolean {
  return SCHEDULE_TIMEZONES.some((zone) => zone.value === value);
}

/** When this post may be reposted again, or null if it is ready now. */
export function nextRepostAllowedAt(
  lastRepostedAt: Date | null,
  minIntervalMs: number,
  now: Date,
): Date | null {
  if (!lastRepostedAt) return null;
  const next = new Date(lastRepostedAt.getTime() + minIntervalMs);
  return next > now ? next : null;
}
