import type { TargetAccount } from "@/generated/prisma/client";
import { SubmitButton } from "@/features/posts/submit-button";
import { removeLabelAction, removeTargetAction, saveNoteAction, setRoleAction } from "./actions";
import { ROLE_LABELS, ROLE_ORDER, STATUS_META, STATUS_ORDER } from "./creator-status";
import { changeStatusAction } from "./outreach-actions";

/** Status, tags, note and remove on the creator page (M7.1; outreach arrives in 7.2). */
export function CreatorDetails({ creator }: { creator: TargetAccount }) {
  const status = STATUS_META[creator.status];
  return (
    <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <form action={changeStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="targetId" value={creator.id} />
          <label className="sr-only" htmlFor={`status-${creator.id}`}>
            Status
          </label>
          <select
            id={`status-${creator.id}`}
            name="status"
            defaultValue={creator.status}
            className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${status.tone}`}
          >
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_META[value].label}
              </option>
            ))}
          </select>
          <SubmitButton variant="ghost" pendingLabel="…">
            Save
          </SubmitButton>
        </form>
        <form action={setRoleAction} className="flex items-center gap-2">
          <input type="hidden" name="targetId" value={creator.id} />
          <label className="sr-only" htmlFor={`role-${creator.id}`}>
            Role
          </label>
          <select
            id={`role-${creator.id}`}
            name="role"
            defaultValue={creator.role ?? ""}
            className="bg-foreground/5 rounded-full border-0 px-2 py-0.5 text-xs font-medium"
          >
            <option value="">No role</option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <SubmitButton variant="ghost" pendingLabel="…">
            Save
          </SubmitButton>
        </form>
        {creator.tags.map((tag) => (
          <form key={tag} action={removeLabelAction} className="contents">
            <input type="hidden" name="targetId" value={creator.id} />
            <input type="hidden" name="tag" value={tag} />
            <button
              type="submit"
              title={`Remove label ${tag}`}
              className="bg-foreground/5 hover:bg-foreground/10 rounded px-1.5 text-xs"
            >
              {tag} ×
            </button>
          </form>
        ))}
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
