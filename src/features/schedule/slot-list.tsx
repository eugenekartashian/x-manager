import type { SlotWithPost } from "@/server/repositories/schedules";
import { localDateOf, zonedToUtc } from "@/lib/zoned-time";
import { SubmitButton } from "@/features/posts/submit-button";
import { deleteSlotAction } from "./actions";
import { formatTime, timezoneLabel } from "./labels";
import { ListBadge } from "./list-badge";

type Props = { slots: SlotWithPost[]; workspaceTimezone: string; now: Date };

function targetLabel(slot: SlotWithPost): string {
  if (slot.target === "PINNED") return "📌 Pinned post";
  if (slot.target === "NEXT_FROM_LIST") return "Next from repost list";
  if (!slot.ownPost) return "A post that no longer exists";
  const text = slot.ownPost.text.replace(/\s+/g, " ").trim();
  return `“${text.length > 60 ? `${text.slice(0, 60)}…` : text || "(media only)"}”`;
}

export function SlotList({ slots, workspaceTimezone, now }: Props) {
  if (slots.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        No daily times yet. Add the first one below.
      </p>
    );
  }

  // Sort by today's instant so EU and US times interleave correctly.
  const rows = slots
    .map((slot) => {
      const at = zonedToUtc(localDateOf(now, slot.timezone), slot.localTime, slot.timezone);
      return { slot, at };
    })
    .sort((a, b) =>
      formatTime(a.at, workspaceTimezone).localeCompare(formatTime(b.at, workspaceTimezone)),
    );

  return (
    <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {rows.map(({ slot, at }) => (
        <li key={slot.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
          <div className="w-44 shrink-0">
            <p className="font-medium tabular-nums">
              {slot.localTime}{" "}
              <span className="text-foreground/70 font-normal">{timezoneLabel(slot.timezone)}</span>
            </p>
            {slot.timezone !== workspaceTimezone && (
              <p className="text-foreground/60 text-xs">
                = {formatTime(at, workspaceTimezone)} {timezoneLabel(workspaceTimezone)}
              </p>
            )}
          </div>
          {slot.target === "NEXT_FROM_LIST" ? (
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <ListBadge />
              <span className="text-foreground/70 truncate">next post in order</span>
            </p>
          ) : (
            <p className="min-w-0 flex-1 truncate text-sm">{targetLabel(slot)}</p>
          )}
          <form action={deleteSlotAction}>
            <input type="hidden" name="slotId" value={slot.id} />
            <SubmitButton variant="ghost" pendingLabel="…">
              Delete
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
