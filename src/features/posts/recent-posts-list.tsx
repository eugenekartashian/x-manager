import type { OwnPost } from "@/generated/prisma/client";
import { toggleRotationAction } from "./actions";
import { PostText } from "./post-text";
import { SubmitButton } from "./submit-button";

export function RecentPostsList({ posts, timeZone }: { posts: OwnPost[]; timeZone: string }) {
  if (posts.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        No posts loaded yet. Use “Refresh from X” to load your recent posts.
      </p>
    );
  }

  return (
    <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {posts.map((post) => (
        <li key={post.id} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap">
          <PostText post={post} timeZone={timeZone} />
          <form
            action={toggleRotationAction}
            className="flex shrink-0 items-center gap-2 self-center"
          >
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="inRotation" value={post.inRotation ? "false" : "true"} />
            {post.inRotation ? (
              <>
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  ✓ In repost list
                </span>
                <SubmitButton variant="secondary" pendingLabel="Removing…">
                  Remove
                </SubmitButton>
              </>
            ) : (
              <SubmitButton variant="secondary" pendingLabel="Adding…">
                + Add to repost list
              </SubmitButton>
            )}
          </form>
        </li>
      ))}
    </ul>
  );
}
