import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecentReplies } from "@/features/replies/recent-replies";
import { replyBlockMessage } from "@/features/replies/block-message";
import { TargetPosts } from "@/features/replies/target-posts";
import { formatCount, formatUsd } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/session";
import { CreatorDetails } from "@/features/targets/creator-details";
import { CheckRepostButton } from "@/features/targets/check-repost-button";
import { FindSimilarButton } from "@/features/targets/find-similar-button";
import { FIND_SIMILAR_MAX_MICROS } from "@/server/services/discovery";
import { CreatorHistory } from "@/features/targets/creator-history";
import { MessageComposer } from "@/features/targets/message-composer";
import { TargetsDisabled } from "@/features/targets/targets-disabled";
import { isAiEnabled } from "@/server/services/ai-replies";
import { getLimitsContext, usedToday } from "@/server/services/limits";
import { canSendDirectMessages } from "@/server/integrations/x/oauth";
import { findConnection } from "@/server/repositories/x-accounts";
import {
  chatLinkFor,
  creatorHistory,
  messagePostOptions,
  messagesToday,
} from "@/server/services/outreach";
import { latestPromotedPostUrl, repostProofFor } from "@/server/services/repost-checks";
import { MAX_CHECK_COST_MICROS } from "@/server/domain/repost-check-rules";
import { getSessionData, listRecentReplies } from "@/server/services/replies";

export default async function ReplySessionPage({ params }: PageProps<"/targets/[id]">) {
  const { workspace, role } = await requireWorkspace();
  const showCosts = role === "SUPERADMIN";
  const { limits } = await getLimitsContext(workspace.id);
  if (limits && !limits.targetsEnabled) return <TargetsDisabled />;
  const { id } = await params;
  const data = await getSessionData(workspace, id);
  if (!data) notFound();
  const { target, posts, templates } = data;
  const tz = workspace.timezone;
  const now = new Date();

  const blockMessage = replyBlockMessage(data, tz);
  const aiEnabled = isAiEnabled() && (limits?.aiEnabled ?? true);
  // Remaining daily allowances for regular users (the superadmin has none).
  const [loadsToday, aiToday] = limits
    ? await Promise.all([
        usedToday(workspace.id, "TARGET_LOAD", tz, now),
        usedToday(workspace.id, "AI_IDEAS", tz, now, target.id),
      ])
    : [0, 0];
  const [allReplies, history, messages, connection] = await Promise.all([
    listRecentReplies(workspace.id),
    creatorHistory(workspace.id, target.id),
    messagesToday(workspace, now),
    findConnection(workspace.id),
  ]);
  const me = connection?.username ?? "i";
  // DM via the X API: superadmin-only experiment (D-034), needs a connection with dm.write.
  const apiSend =
    role !== "SUPERADMIN"
      ? null
      : connection && canSendDirectMessages(connection.scopes)
        ? "ready"
        : "reconnect";
  const chatLink = await chatLinkFor(workspace.id, target.xUserId);
  const [promotedPostUrl, repostProofUrl] = await Promise.all([
    latestPromotedPostUrl(workspace.id, target.id, now),
    repostProofFor(workspace.id, target.id),
  ]);
  const replies = allReplies.filter((reply) => reply.targetId === target.id);
  // Own posts the message can link to: repost list first, then recent ones (no X calls).
  const postOptions = await messagePostOptions(workspace.id, me, now);

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

      <CreatorDetails creator={target} repostProofUrl={repostProofUrl} />
      {promotedPostUrl && target.status !== "REPOSTED" && target.status !== "PARTNER" && (
        <CheckRepostButton
          targetId={target.id}
          username={target.username}
          postUrl={promotedPostUrl}
          cost={showCosts ? formatUsd(BigInt(MAX_CHECK_COST_MICROS)) : null}
        />
      )}
      {role === "SUPERADMIN" && (
        <FindSimilarButton
          targetId={target.id}
          username={target.username}
          maxCost={formatUsd(BigInt(FIND_SIMILAR_MAX_MICROS))}
          finished={target.followingExhausted}
        />
      )}

      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-medium">Message</h2>
        <p className="text-foreground/60 text-xs">
          Write one personal message — it’s copied and X opens the chat; you paste and send it
          yourself. Different words for every creator keep it human.
        </p>
        <MessageComposer
          targetId={target.id}
          username={target.username}
          chatLink={chatLink}
          recipientXUserId={target.xUserId}
          posts={postOptions}
          aiEnabled={aiEnabled}
          usedToday={messages.used}
          dailyLimit={messages.limit}
          apiSend={apiSend}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">History</h2>
        <CreatorHistory events={history} timeZone={tz} now={now} />
      </section>

      <h2 className="text-lg font-medium">Reply under their posts</h2>

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

      <TargetPosts
        target={target}
        posts={posts}
        templates={templates.map((template) => template.text)}
        blockMessage={blockMessage}
        aiEnabled={aiEnabled}
        showCosts={showCosts}
        timeZone={tz}
        now={now}
        loadNote={
          limits
            ? `Loads left today: ${Math.max(0, limits.targetLoadsPerDay - loadsToday)} of ${limits.targetLoadsPerDay}`
            : undefined
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Your replies to @{target.username}</h2>
        <RecentReplies replies={replies} timeZone={tz} />
      </section>
    </>
  );
}
