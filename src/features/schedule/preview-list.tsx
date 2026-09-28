import type { OwnPost } from "@/generated/prisma/client";
import type { PlannedRepost } from "@/server/domain/repost-plan";
import { formatDay, formatTime, SKIP_LABELS, timezoneLabel } from "./labels";
import { ListBadge } from "./list-badge";

type Props = { items: (PlannedRepost & { post: OwnPost | null })[]; workspaceTimezone: string };

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
      {items.map((item) => (
        <li
          key={item.key}
          className={`flex gap-3 p-3 text-sm ${item.skipReason ? "opacity-60" : ""}`}
        >
          <div className="w-40 shrink-0 tabular-nums">
            <p className="font-medium">
              {formatDay(item.runAt, workspaceTimezone)},{" "}
              {formatTime(item.runAt, workspaceTimezone)}
            </p>
            {item.timezone !== workspaceTimezone && (
              <p className="text-foreground/60 text-xs">
                {item.localTime} {timezoneLabel(item.timezone)}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {item.target === "next" && <ListBadge />}
            {item.post && (
              <p className="truncate">
                {item.target === "pinned" && "📌 "}
                {item.post.text.replace(/\s+/g, " ").trim() || "(media only)"}
              </p>
            )}
            {item.skipReason && (
              <p className="text-amber-700 dark:text-amber-400">{SKIP_LABELS[item.skipReason]}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
