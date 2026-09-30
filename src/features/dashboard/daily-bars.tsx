"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/format";

// Small interactive stacked bar chart in plain HTML/CSS (no chart library). Hover, tap or
// focus a bar to see that day's numbers; values are also in a visually hidden table.

export type BarSegment = { value: number; className: string; label: string };
export type BarDay = { day: string; label: string; segments: BarSegment[] };

type Props = {
  title: string;
  days: BarDay[];
  legend: { className: string; label: string }[];
  /** "usd": values are micro-dollars. Functions can't be passed from server components. */
  unit?: "count" | "usd";
};

export function DailyBars({ title, days, legend, unit = "count" }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const format = (value: number) =>
    unit === "usd" ? formatUsd(BigInt(Math.round(value))) : String(value);
  const totals = days.map((day) => day.segments.reduce((sum, segment) => sum + segment.value, 0));
  const max = Math.max(1, ...totals);
  const total = totals.reduce((sum, value) => sum + value, 0);
  const activeDay = active === null ? null : days[active];
  // Keep the tooltip inside the chart near the edges.
  const position =
    active === null ? 0 : Math.min(85, Math.max(15, ((active + 0.5) / days.length) * 100));

  return (
    <figure className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-foreground/60 text-xs tabular-nums">
          {format(total)} in {days.length} days
        </span>
      </figcaption>

      <div className="relative pt-16" onMouseLeave={() => setActive(null)}>
        {activeDay && (
          <div
            role="status"
            className="border-foreground/10 bg-background pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-md border px-3 py-2 text-xs shadow-md"
            style={{ left: `${position}%` }}
          >
            <p className="font-medium">{activeDay.label}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {activeDay.segments.map((segment) => (
                <li key={segment.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-sm ${segment.className}`} />
                    {segment.label}
                  </span>
                  <span className="font-medium tabular-nums">{format(segment.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex h-28 items-end gap-1">
          {days.map((day, index) => {
            const dayTotal = totals[index] ?? 0;
            return (
              <button
                key={day.day}
                type="button"
                aria-label={`${day.label}: ${day.segments.map((segment) => `${segment.label} ${format(segment.value)}`).join(", ")}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(index)}
                className={`group flex h-full flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:ring-2 focus-visible:outline-none ${
                  active === index ? "bg-foreground/5" : ""
                }`}
              >
                <span
                  className={`flex w-full flex-col-reverse overflow-hidden rounded-sm transition-opacity ${
                    active !== null && active !== index ? "opacity-40" : ""
                  }`}
                  style={{ height: dayTotal === 0 ? "2px" : `${(dayTotal / max) * 100}%` }}
                >
                  {dayTotal === 0 ? (
                    <span className="bg-foreground/10 h-full w-full" />
                  ) : (
                    day.segments.map((segment) =>
                      segment.value > 0 ? (
                        <span
                          key={segment.label}
                          className={segment.className}
                          style={{ flexGrow: segment.value, minHeight: 2 }}
                        />
                      ) : null,
                    )
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-foreground/50 flex justify-between text-[11px]" aria-hidden>
        <span>{days[0]?.label}</span>
        <span>{days[Math.floor(days.length / 2)]?.label}</span>
        <span>{days.at(-1)?.label}</span>
      </div>
      {legend.length > 1 && (
        <ul className="text-foreground/70 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${item.className}`} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {days.map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.label}</th>
              {day.segments.map((segment) => (
                <td key={segment.label}>
                  {segment.label}: {format(segment.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
