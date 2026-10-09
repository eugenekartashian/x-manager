import type { CreatorEvent } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/format";
import { STATUS_META } from "./creator-status";

/** Timeline of messages and status changes for one creator (M7.2). */
export function CreatorHistory({ events, timeZone }: { events: CreatorEvent[]; timeZone: string }) {
  if (events.length === 0) {
    return <p className="text-foreground/60 text-sm">No contact yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {events.map((event) => (
        <li key={event.id} className={`flex gap-3 ${event.undoneAt ? "opacity-50" : ""}`}>
          <span className="text-foreground/50 w-28 shrink-0 text-xs tabular-nums">
            {formatDateTime(event.createdAt, timeZone)}
          </span>
          <span className="min-w-0 flex-1">
            {event.kind === "MESSAGE_OPENED" ? (
              <>
                <span className="font-medium">Messaged</span>
                {event.undoneAt && <span className="text-foreground/60"> (undone)</span>}
                {event.text && (
                  <span className="text-foreground/70 mt-0.5 line-clamp-2 block break-words whitespace-pre-line">
                    {event.text}
                  </span>
                )}
              </>
            ) : (
              <>
                Status →{" "}
                <span className="font-medium">
                  {event.status ? STATUS_META[event.status].label : "?"}
                </span>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
