// Small stacked bar chart in plain HTML/CSS (no chart library). Each bar has a text label for
// screen readers and a tooltip; values are also listed in a visually hidden table.

export type BarSegment = { value: number; className: string; label: string };
export type BarDay = { day: string; label: string; segments: BarSegment[] };

type Props = {
  title: string;
  days: BarDay[];
  legend: { className: string; label: string }[];
  format?: (value: number) => string;
};

export function DailyBars({ title, days, legend, format = String }: Props) {
  const totals = days.map((day) => day.segments.reduce((sum, segment) => sum + segment.value, 0));
  const max = Math.max(1, ...totals);
  const total = totals.reduce((sum, value) => sum + value, 0);

  return (
    <figure className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-foreground/60 text-xs tabular-nums">
          {format(total)} in {days.length} days
        </span>
      </figcaption>
      <div className="flex h-28 items-end gap-1" aria-hidden>
        {days.map((day, index) => (
          <div
            key={day.day}
            className="flex h-full flex-1 flex-col justify-end"
            title={`${day.label}: ${day.segments.map((segment) => `${segment.label} ${format(segment.value)}`).join(", ")}`}
          >
            <div
              className="flex flex-col-reverse overflow-hidden rounded-sm"
              style={{ height: `${((totals[index] ?? 0) / max) * 100}%` }}
            >
              {day.segments.map((segment) =>
                segment.value > 0 ? (
                  <div
                    key={segment.label}
                    className={segment.className}
                    style={{ flexGrow: segment.value, minHeight: 2 }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-foreground/50 flex justify-between text-[11px]" aria-hidden>
        <span>{days[0]?.label}</span>
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
