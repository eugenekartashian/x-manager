import type { OwnPost } from "@/generated/prisma/client";
import type { PlannedRepost } from "@/server/domain/repost-plan";
import { formatDay, formatTime, SKIP_LABELS, timezoneLabel } from "./labels";
import { ListBadge } from "./list-badge";

type Item = PlannedRepost & { post: OwnPost | null };
type Props = { items: Item[]; workspaceTimezone: string };

/** Groups planned Reposts into batches (one per daily time and date). */
function batches(items: Item[]): Item[][] {
  const groups = new Map<string, Item[]>();
  for (const item of items) groups.set(item.batchKey, [...(groups.get(item.batchKey) ?? []), item]);
  // Items run in list order (first = reposted first).
  return [...groups.values()];
}

export function PreviewList({ items, workspaceTimezone }: Props) {
  if (items.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        Nothing planned in the next 48 hours. Turn the schedule on and add daily times.
      </p>
    );
  }

  return (
    <ol className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {batches(items).map((batch) => {
        const first = batch[0];
        if (!first) return null;
        const planned = batch.filter((item) => !item.skipReason).length;
        return (
          <li key={first.batchKey} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:gap-3">
            <div className="w-40 shrink-0 tabular-nums">
              <p className="font-medium">
                {formatDay(first.runAt, workspaceTimezone)},{" "}
                {formatTime(first.runAt, workspaceTimezone)}
              </p>
              {first.timezone !== workspaceTimezone && (
                <p className="text-foreground/60 text-xs">
                  {first.localTime} {timezoneLabel(first.timezone)}
                </p>
              )}
              <p className="text-foreground/60 mt-1 text-xs">
                {planned} of {batch.length} to repost
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <ListBadge />
              <ul className="flex flex-col gap-0.5">
                {batch.map((item) => (
                  <li key={item.key} className={`truncate ${item.skipReason ? "opacity-60" : ""}`}>
                    {item.post ? item.post.text.replace(/\s+/g, " ").trim() || "(media only)" : ""}
                    {item.skipReason && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {item.post ? " · " : ""}
                        {SKIP_LABELS[item.skipReason]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
