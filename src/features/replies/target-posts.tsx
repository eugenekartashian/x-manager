import Image from "next/image";
import type { TargetAccount, TargetPost } from "@/generated/prisma/client";
import { formatAge, formatCount, formatDateTime } from "@/lib/format";
import { isFreshPost } from "@/server/domain/reply-rules";
import { LoadPostsForm } from "./load-posts-form";
import { ReplyComposer } from "./reply-composer";

type Props = {
  target: Pick<TargetAccount, "id" | "username" | "postsFetchedAt">;
  posts: TargetPost[];
  templates: string[];
  /** Why replying is blocked right now (daily limit / cooldown), or null. */
  blockMessage: string | null;
  aiEnabled: boolean;
  showCosts: boolean;
  timeZone: string;
  now: Date;
  loadNote?: string | undefined;
  /** Replaces the "Latest posts" heading (the multi-creator reply page shows the creator). */
  title?: React.ReactNode;
};

/** A creator's loaded posts, each with a reply composer (posts load only on click). */
export function TargetPosts({
  target,
  posts,
  templates,
  blockMessage,
  aiEnabled,
  showCosts,
  timeZone,
  now,
  loadNote,
  title,
}: Props) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {title ?? <h2 className="text-lg font-medium">Latest posts</h2>}
        <LoadPostsForm
          targetId={target.id}
          hasPosts={posts.length > 0}
          showCosts={showCosts}
          note={loadNote}
        />
      </div>
      {posts.length === 0 ? (
        <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
          {target.postsFetchedAt
            ? `No new original posts from @${target.username} — lately they’ve only been replying or reposting. Try again later.`
            : "Load the latest posts to pick one to reply to."}
        </p>
      ) : (
        <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
          {posts.map((post) => (
            <li key={post.id} className="flex flex-col gap-3 p-3">
              <div className="flex gap-3">
                {post.mediaCount > 0 && (
                  <div className="bg-foreground/10 relative size-16 shrink-0 overflow-hidden rounded-md">
                    {post.mediaPreviewUrl && (
                      <Image
                        src={post.mediaPreviewUrl}
                        alt=""
                        fill
                        sizes="64px"
                        unoptimized
                        referrerPolicy="no-referrer"
                        className="object-cover"
                      />
                    )}
                    {(post.mediaType === "video" || post.mediaType === "animated_gif") && (
                      <span className="absolute inset-0 flex items-center justify-center text-lg text-white drop-shadow">
                        ▶
                      </span>
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 text-sm break-words whitespace-pre-line">
                    {post.text}
                  </p>
                  <p className="text-foreground/60 mt-1 flex flex-wrap gap-x-3 text-xs">
                    {isFreshPost(post.postedAt, now) ? (
                      <span className="rounded bg-green-600/10 px-1.5 font-medium text-green-700 dark:text-green-400">
                        fresh
                      </span>
                    ) : (
                      <span
                        className="bg-foreground/10 rounded px-1.5 font-medium"
                        title="Older than 24 h — few people will see a reply here."
                      >
                        old
                      </span>
                    )}
                    <span title={formatDateTime(post.postedAt, timeZone)}>
                      {formatAge(post.postedAt, now)}
                    </span>
                    <span>♥ {formatCount(post.likeCount)}</span>
                    <span>💬 {formatCount(post.replyCount)}</span>
                    <span>👁 {formatCount(post.impressionCount)}</span>
                    <a
                      href={`https://x.com/i/status/${post.xPostId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      Open on X ↗
                    </a>
                  </p>
                </div>
              </div>
              <ReplyComposer
                targetId={target.id}
                xPostId={post.xPostId}
                templates={templates}
                disabledReason={blockMessage}
                aiEnabled={aiEnabled}
                showCosts={showCosts}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
