export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatUsd(micros: bigint): string {
  // Show a third decimal only for sub-cent amounts, e.g. $0.035.
  const decimals = micros % 10_000n === 0n ? 2 : 3;
  return `$${(Number(micros) / 1_000_000).toFixed(decimals)}`;
}

export function formatCount(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

/** Compact age, e.g. "just now", "25 min ago", "3 h ago", "2 d ago". */
export function formatAge(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** "2026-09-28 18:42" in the given timezone — a form Excel recognises as a date. */
export function formatSpreadsheetDateTime(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
