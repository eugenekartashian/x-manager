import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadPostsForm } from "@/features/replies/load-posts-form";
import { RecentReplies } from "@/features/replies/recent-replies";
import { ReplyComposer } from "@/features/replies/reply-composer";
import { formatAge, formatCount, formatDateTime } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/session";
import { isFreshPost } from "@/server/domain/reply-rules";
import { CreatorDetails } from "@/features/targets/creator-details";
import { TargetsDisabled } from "@/features/targets/targets-disabled";
import { isAiEnabled } from "@/server/services/ai-replies";
import { getLimitsContext, usedToday } from "@/server/services/limits";
import { getSessionData, listRecentReplies } from "@/server/services/replies";

export default async function ReplySessionPage({ params }: PageProps<"/targets/[id]">) {
  const { workspace, role } = await requireWorkspace();
  const showCosts = role === "SUPERADMIN";
  const { limits } = await getLimitsContext(workspace.id);
  if (limits && !limits.targetsEnabled) return <TargetsDisabled />;
  const { id } = await params;
  const data = await getSessionData(workspace, id);
  if (!data) notFound();
  const { target, posts, templates, block } = data;
  const tz = workspace.timezone;
  const now = new Date();

  const blockMessage =
    block?.reason === "daily_limit"
      ? `Daily limit reached (${data.limits.perDay} replies). Try again tomorrow.`
      : block?.reason === "account_cooldown"
        ? `You replied to @${target.username} recently — next reply from ${formatDateTime(block.until, tz)}.`
        : null;
  const aiEnabled = isAiEnabled() && (limits?.aiEnabled ?? true);
  // Remaining daily allowances for regular users (the superadmin has none).
  const [loadsToday, aiToday] = limits
    ? await Promise.all([
        usedToday(workspace.id, "TARGET_LOAD", tz, now),
        usedToday(workspace.id, "AI_IDEAS", tz, now, target.id),
      ])
    : [0, 0];
  const replies = (await listRecentReplies(workspace.id)).filter(
    (reply) => reply.targetId === target.id,
  );

  return (
    <>
      <Link href="/targets" className="text-foreground/70 hover:text-foreground text-sm">
        ← Creators
      </Link>

      <header className="flex items-start gap-3">
        <div className="bg-foreground/10 relative size-14 shrink-0 overflow-hidden rounded-full">
          {target.avatarUrl && (
            <Image
              src={target.avatarUrl}
              alt=""
              fill
              sizes="56px"
              unoptimized
              referrerPolicy="no-referrer"
            />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{target.name}</h1>
          <a
            href={`https://x.com/${target.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/60 text-sm underline-offset-2 hover:underline"
          >
            @{target.username} ↗
          </a>
          <p className="text-foreground/60 text-xs">
            {formatCount(target.followersCount)} followers · {formatCount(target.postsCount)} posts
          </p>
        </div>
      </header>

      <CreatorDetails creator={target} />

      <p className="bg-foreground/5 rounded-md px-3 py-2 text-sm">
        Replies today:{" "}
        <strong className="tabular-nums">
          {data.repliesToday}/{data.limits.perDay}
        </strong>{" "}
        · max 1 reply per account per {data.limits.cooldownHours} h.
        {limits && aiEnabled && (
          <>
            {" "}
            AI ideas left today for @{target.username}:{" "}
            <strong className="tabular-nums">
              {Math.max(0, limits.aiIdeasPerTargetPerDay - aiToday)}/{limits.aiIdeasPerTargetPerDay}
            </strong>
            .
          </>
        )}{" "}
        The reply opens in X — attach your photo/video there and post.
      </p>
      {templates.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No reply templates yet —{" "}
          <Link href="/targets" className="underline">
            add a few
          </Link>{" "}
          to get suggestions.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-medium">Latest posts</h2>
          <LoadPostsForm
            targetId={target.id}
            hasPosts={posts.length > 0}
            showCosts={showCosts}
            note={
              limits
                ? `Loads left today: ${Math.max(0, limits.targetLoadsPerDay - loadsToday)} of ${limits.targetLoadsPerDay}`
                : undefined
            }
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
                      <span title={formatDateTime(post.postedAt, tz)}>
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
                  templates={templates.map((template) => template.text)}
                  disabledReason={blockMessage}
                  aiEnabled={aiEnabled}
                  showCosts={showCosts}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Your replies to @{target.username}</h2>
        <RecentReplies replies={replies} timeZone={tz} />
      </section>
    </>
  );
}
