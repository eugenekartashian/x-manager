import type { TargetAccount } from "@/generated/prisma/client";
import { SubmitButton } from "@/features/posts/submit-button";
import { removeTargetAction, saveNoteAction } from "./actions";
import { STATUS_META } from "./creator-status";

/** Status, tags, note and remove on the creator page (M7.1; outreach arrives in 7.2). */
export function CreatorDetails({ creator }: { creator: TargetAccount }) {
  const status = STATUS_META[creator.status];
  return (
    <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
          {status.label}
        </span>
        {creator.tags.map((tag) => (
          <span key={tag} className="bg-foreground/5 rounded px-1.5 text-xs">
            #{tag}
          </span>
        ))}
        <span className="text-foreground/50 text-xs">
          Change status and tags from the Creators list.
        </span>
      </div>
      <form action={saveNoteAction} className="flex gap-2">
        <input type="hidden" name="targetId" value={creator.id} />
        <input
          name="note"
          defaultValue={creator.note ?? ""}
          maxLength={200}
          placeholder="Note (topic, what they like, how you met…)"
          aria-label={`Note for @${creator.username}`}
          className="border-foreground/15 min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <SubmitButton variant="secondary" pendingLabel="…">
          Save note
        </SubmitButton>
      </form>
      <form action={removeTargetAction} className="flex justify-end">
        <input type="hidden" name="targetId" value={creator.id} />
        <SubmitButton variant="ghost" pendingLabel="Removing…">
          Remove from creators
        </SubmitButton>
      </form>
    </section>
  );
}
