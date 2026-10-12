import { SubmitButton } from "@/features/posts/submit-button";
import { markRepostedByHandAction } from "./outreach-actions";

/** Free manual marks for when the Repost was seen in X — no API check needed. */
export function MarkReposted({ targetId }: { targetId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <form action={markRepostedByHandAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value="0" />
        <SubmitButton variant="secondary" pendingLabel="…">
          ✓ They reposted
        </SubmitButton>
      </form>
      <form action={markRepostedByHandAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value="1" />
        <SubmitButton variant="secondary" pendingLabel="…">
          ✓ Both reposted
        </SubmitButton>
      </form>
      <span className="text-foreground/50 text-xs">Saw it in X yourself? Mark it — free.</span>
    </div>
  );
}
