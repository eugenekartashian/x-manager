import type { TargetAccount } from "@/generated/prisma/client";
import { SubmitButton } from "@/features/posts/submit-button";
import { removeLabelAction, removeTargetAction, saveNoteAction, setRoleAction } from "./actions";
import { AutoSaveSelect } from "./auto-save-select";
import { ROLE_LABELS, ROLE_ORDER, STATUS_META, STATUS_ORDER } from "./creator-status";
import { changeStatusAction, repostedBackAction } from "./outreach-actions";

/** Status and role (saved on change), labels, note and remove on the creator page. */
export function CreatorDetails({ creator }: { creator: TargetAccount }) {
  return (
    <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AutoSaveSelect
          label="Status"
          name="status"
          defaultValue={creator.status}
          options={STATUS_ORDER.map((value) => ({ value, label: STATUS_META[value].label }))}
          hidden={{ targetId: creator.id }}
          action={changeStatusAction}
        />
        <AutoSaveSelect
          label="Role"
          name="role"
          defaultValue={creator.role ?? ""}
          options={[
            { value: "", label: "No role" },
            ...ROLE_ORDER.map((value) => ({ value, label: ROLE_LABELS[value] })),
          ]}
          hidden={{ targetId: creator.id }}
          action={setRoleAction}
        />
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
      {creator.status === "REPOSTED" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-green-600/10 px-3 py-2 text-sm">
          {creator.repostedBackAt ? (
            <>
              <span>✓ They reposted your post and you reposted back.</span>
              <form action={repostedBackAction} className="ml-auto">
                <input type="hidden" name="targetId" value={creator.id} />
                <input type="hidden" name="done" value="0" />
                <button type="submit" className="text-foreground/60 text-xs underline">
                  undo
                </button>
              </form>
            </>
          ) : (
            <>
              <span>✓ @{creator.username} reposted your post — repost one of theirs in X.</span>
              <a
                href={`https://x.com/${creator.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Open their profile ↗
              </a>
              <form action={repostedBackAction} className="ml-auto">
                <input type="hidden" name="targetId" value={creator.id} />
                <input type="hidden" name="done" value="1" />
                <SubmitButton variant="primary" pendingLabel="…">
                  ✓ I reposted back
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      )}
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
