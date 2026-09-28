// Wall-clock ↔ UTC conversion for IANA timezones using Intl only.
// DST rules: a wall time skipped by "spring forward" runs at the same wall time
// + the gap (02:30 → 03:30); a wall time that occurs twice ("fall back") maps to
// the earlier instant, so it runs once.

export type LocalDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:MM (24h)

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isLocalTime(value: string): boolean {
  return LOCAL_TIME.test(value);
}

export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Madrid summer = +120). */
function offsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(instant / 60_000) * 60_000) / 60_000);
}

export function zonedToUtc(date: LocalDate, time: LocalTime, timeZone: string): Date {
  const dateMatch = LOCAL_DATE.exec(date);
  const timeMatch = LOCAL_TIME.exec(time);
  if (!dateMatch || !timeMatch) throw new Error(`Invalid local date/time: ${date} ${time}`);
  const wall = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );

  // Offsets a day before and after: at most one DST change lies between them.
  const DAY = 86_400_000;
  const offsetBefore = offsetMinutes(wall - DAY, timeZone);
  const offsetAfter = offsetMinutes(wall + DAY, timeZone);
  const valid = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => wall - offset * 60_000)
    .filter((instant) => offsetMinutes(instant, timeZone) * 60_000 === wall - instant)
    .sort((a, b) => a - b);

  const first = valid[0];
  if (first !== undefined) return new Date(first); // normal or ambiguous → earliest
  // Skipped wall time: apply the pre-transition offset, landing after the gap.
  return new Date(wall - offsetBefore * 60_000);
}

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const match = LOCAL_DATE.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return shifted.toISOString().slice(0, 10);
}
