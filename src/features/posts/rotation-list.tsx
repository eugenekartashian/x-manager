import type { OwnPost } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/format";
import { nextRepostAllowedAt } from "@/server/domain/repost-rules";
import { moveRotationAction, toggleRotationAction } from "./actions";
import { PostText } from "./post-text";
import { SubmitButton } from "./submit-button";

type Props = { posts: OwnPost[]; timeZone: string; now: Date };

export function RotationList({ posts, timeZone, now }: Props) {
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
        const nextAllowed = nextRepostAllowedAt(post.lastRepostedAt, now);
        return (
          <li key={post.id} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap">
            <span className="text-foreground/50 w-5 pt-0.5 text-sm tabular-nums">{index + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <PostText post={post} timeZone={timeZone} />
              <p className="text-foreground/60 text-xs">
                Last reposted:{" "}
                {post.lastRepostedAt ? formatDateTime(post.lastRepostedAt, timeZone) : "never"} ·{" "}
                {nextAllowed ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    cooling down until {formatDateTime(nextAllowed, timeZone)}
                  </span>
                ) : (
                  <span className="text-green-700 dark:text-green-400">ready</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <form action={moveRotationAction}>
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="direction" value="up" />
                <SubmitButton variant="ghost" ariaLabel="Move up">
                  ↑
                </SubmitButton>
              </form>
              <form action={moveRotationAction}>
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="direction" value="down" />
                <SubmitButton variant="ghost" ariaLabel="Move down">
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
          </li>
        );
      })}
    </ol>
  );
}
