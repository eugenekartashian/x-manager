import type { OwnPost } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/format";
import { nextRepostAllowedAt } from "@/server/domain/repost-rules";
import { moveRotationAction, toggleRotationAction } from "./actions";
import { PostText } from "./post-text";
import { SubmitButton } from "./submit-button";

type Props = { posts: OwnPost[]; timeZone: string; now: Date; minIntervalMs: number };

export function RotationList({ posts, timeZone, now, minIntervalMs }: Props) {
  if (posts.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        Your repost list is empty. Add posts with “+ Add to repost list” below, or paste a link.
      </p>
    );
  }

  return (
    <ol className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {posts.map((post, index) => {
        const nextAllowed = nextRepostAllowedAt(post.lastRepostedAt, minIntervalMs, now);
        return (
          <li key={post.id} className="flex flex-col gap-3 p-3">
            <PostText post={post} timeZone={timeZone} />
            {/* Footer: order + status on the left, actions on the right — content keeps full width. */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="bg-foreground text-background flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                  aria-label={`Position ${index + 1}`}
                >
                  {index + 1}
                </span>
                <p className="text-foreground/60 min-w-0 text-xs">
                  {nextAllowed ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Cooling down until {formatDateTime(nextAllowed, timeZone)}
                    </span>
                  ) : (
                    <span className="font-medium text-green-700 dark:text-green-400">Ready</span>
                  )}
                  <span className="block">
                    Last reposted:{" "}
                    {post.lastRepostedAt ? formatDateTime(post.lastRepostedAt, timeZone) : "never"}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <form action={moveRotationAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="direction" value="up" />
                  <SubmitButton variant="icon" ariaLabel="Move up" disabled={index === 0}>
                    ↑
                  </SubmitButton>
                </form>
                <form action={moveRotationAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="direction" value="down" />
                  <SubmitButton
                    variant="icon"
                    ariaLabel="Move down"
                    disabled={index === posts.length - 1}
                  >
                    ↓
                  </SubmitButton>
                </form>
                <form action={toggleRotationAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="inRotation" value="false" />
                  <SubmitButton variant="ghost" pendingLabel="…">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
