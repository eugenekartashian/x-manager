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
