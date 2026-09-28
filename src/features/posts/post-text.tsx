import Image from "next/image";
import type { OwnPost } from "@/generated/prisma/client";
import { formatCount, formatDateTime } from "@/lib/format";

export function PostText({ post, timeZone }: { post: OwnPost; timeZone: string }) {
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <MediaPreview post={post} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm break-words whitespace-pre-line">
          {post.text || <span className="text-foreground/50 italic">(media only)</span>}
        </p>
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
    </div>
  );
}

function MediaPreview({ post }: { post: OwnPost }) {
  if (post.mediaCount === 0) return null;
  const isVideo = post.mediaType === "video" || post.mediaType === "animated_gif";

  return (
    <div className="bg-foreground/10 relative size-16 shrink-0 overflow-hidden rounded-md">
      {post.mediaPreviewUrl ? (
        <Image
          src={post.mediaPreviewUrl}
          alt=""
          fill
          sizes="64px"
          unoptimized
          referrerPolicy="no-referrer"
          className="object-cover"
        />
      ) : (
        <span className="text-foreground/50 flex size-full items-center justify-center text-xs">
          media
        </span>
      )}
      {isVideo && (
        <span className="absolute inset-0 flex items-center justify-center text-lg text-white drop-shadow">
          ▶
        </span>
      )}
      {post.mediaCount > 1 && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
          +{post.mediaCount - 1}
        </span>
      )}
    </div>
  );
}
