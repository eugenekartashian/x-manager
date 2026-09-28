import { SCHEDULE_TIMEZONES } from "@/server/domain/repost-rules";
import type { SkipReason } from "@/server/domain/repost-plan";

export function timezoneLabel(zone: string): string {
  return SCHEDULE_TIMEZONES.find((item) => item.value === zone)?.label.split(" / ")[0] ?? zone;
}

export const SKIP_LABELS: Record<SkipReason, string> = {
  no_pinned: "skipped — no pinned post loaded (refresh posts)",
  no_post: "skipped — the chosen post is gone",
  empty_list: "skipped — repost list is empty",
  interval: "skipped — post reposted too recently",
  daily_cap: "skipped — daily limit reached",
};

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
}

export function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}
