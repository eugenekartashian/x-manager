import Image from "next/image";
import type { TargetAccount } from "@/generated/prisma/client";
import { SubmitButton } from "@/features/posts/submit-button";
import { formatCount, formatDateTime } from "@/lib/format";
import { removeTargetAction, saveNoteAction } from "./actions";

type Props = { targets: TargetAccount[]; timeZone: string };

export function TargetList({ targets, timeZone }: Props) {
  if (targets.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        No target accounts yet. Add niche accounts you want to reply to.
      </p>
    );
  }

  return (
    <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {targets.map((target) => (
        <li key={target.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="bg-foreground/10 relative size-10 shrink-0 overflow-hidden rounded-full">
              {target.avatarUrl && (
                <Image
                  src={target.avatarUrl}
                  alt=""
                  fill
                  sizes="40px"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-medium">{target.name}</span>{" "}
                <a
                  href={`https://x.com/${target.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/60 underline-offset-2 hover:underline"
                >
                  @{target.username}
                </a>
                {target.verified && (
                  <span className="ml-1 text-blue-600" title="Verified">
                    ✓
                  </span>
                )}
              </p>
              <p className="text-foreground/60 text-xs">
                {formatCount(target.followersCount)} followers · {formatCount(target.postsCount)}{" "}
                posts
                {target.lastRepliedAt &&
                  ` · replied ${formatDateTime(target.lastRepliedAt, timeZone)}`}
              </p>
              {target.bio && (
                <p className="text-foreground/70 mt-1 line-clamp-2 text-xs break-words">
                  {target.bio}
                </p>
              )}
              <form action={saveNoteAction} className="mt-2 flex gap-2">
                <input type="hidden" name="targetId" value={target.id} />
                <input
                  name="note"
                  defaultValue={target.note ?? ""}
                  maxLength={200}
                  placeholder="Note (topic, what they like…)"
                  aria-label={`Note for @${target.username}`}
                  className="border-foreground/15 min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                />
                <SubmitButton variant="ghost" pendingLabel="…">
                  Save
                </SubmitButton>
              </form>
            </div>
          </div>
          <form action={removeTargetAction} className="shrink-0 self-end sm:self-start">
            <input type="hidden" name="targetId" value={target.id} />
            <SubmitButton variant="ghost" pendingLabel="…" ariaLabel={`Remove @${target.username}`}>
              Remove
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
