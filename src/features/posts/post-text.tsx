import type { OwnPost } from "@/generated/prisma/client";
import { formatCount, formatDateTime } from "@/lib/format";

export function PostText({ post, timeZone }: { post: OwnPost; timeZone: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-sm break-words whitespace-pre-line">{post.text}</p>
      <p className="text-foreground/60 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {post.isPinned && (
          <span className="bg-foreground/10 text-foreground rounded px-1.5 py-0.5 font-medium">
            Pinned
          </span>
        )}
        <span>{formatDateTime(post.postedAt, timeZone)}</span>
        <span title="Likes">♥ {formatCount(post.likeCount)}</span>
        <span title="Reposts">↻ {formatCount(post.repostCount)}</span>
        <span title="Impressions">👁 {formatCount(post.impressionCount)}</span>
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
  );
}
