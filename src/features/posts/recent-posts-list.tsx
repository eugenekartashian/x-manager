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
          <form action={toggleRotationAction} className="shrink-0">
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="inRotation" value={post.inRotation ? "false" : "true"} />
            {post.inRotation ? (
              <SubmitButton variant="ghost" pendingLabel="…">
                ✓ In rotation
              </SubmitButton>
            ) : (
              <SubmitButton variant="secondary" pendingLabel="Adding…">
                Add to rotation
              </SubmitButton>
            )}
          </form>
        </li>
      ))}
    </ul>
  );
}
