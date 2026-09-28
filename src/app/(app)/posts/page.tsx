import Link from "next/link";
import { AddPostForm } from "@/features/posts/add-post-form";
import { ConnectXFirst } from "@/features/x-account/connect-x-first";
import { errorMessage } from "@/features/posts/messages";
import { RecentPostsList } from "@/features/posts/recent-posts-list";
import { RefreshPostsForm } from "@/features/posts/refresh-posts-form";
import { RotationList } from "@/features/posts/rotation-list";
import { formatDateTime, formatUsd } from "@/lib/format";
import { MAX_LIST_SIZE } from "@/server/domain/repost-rules";
import { requireWorkspace } from "@/server/auth/session";
import { getPostsPageData, REFRESH_ESTIMATE_MICROS } from "@/server/services/own-posts";

export default async function PostsPage() {
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const data = await getPostsPageData(workspace.id, now);
  const timeZone = workspace.timezone;

  if (!data.connected) {
    return <ConnectXFirst title="Posts" message={errorMessage(data.reason)} />;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
        <p className="text-foreground/70 text-sm">
          API spend this month (estimate): {formatUsd(data.budget.spentMicros)} of{" "}
          {formatUsd(data.budget.budgetMicros)}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">
            Repost list <span className="text-foreground/50">({data.rotation.length})</span>
          </h2>
          <p className="text-foreground/70 text-sm">
            At every daily time, all posts in this list are reposted. The first post ends up on top
            of your timeline. Each post is reposted at most once every{" "}
            {workspace.perPostMinIntervalMinutes / 60} h — set times and limits on the{" "}
            <Link href="/schedule" className="underline underline-offset-2">
              Schedule
            </Link>{" "}
            page. Use ↑ ↓ to reorder.
          </p>
        </div>
        <RotationList
          posts={data.rotation}
          timeZone={timeZone}
          now={now}
          minIntervalMs={workspace.perPostMinIntervalMinutes * 60_000}
        />
        <AddPostForm />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Your recent posts</h2>
            <p className="text-foreground/70 text-sm">
              {workspace.postsSyncedAt
                ? `Last loaded ${formatDateTime(workspace.postsSyncedAt, timeZone)}`
                : "Not loaded yet"}
            </p>
          </div>
          <RefreshPostsForm costLabel={formatUsd(BigInt(REFRESH_ESTIMATE_MICROS))} />
        </div>
        <RecentPostsList
          posts={data.recent}
          timeZone={timeZone}
          listFull={data.rotation.length >= MAX_LIST_SIZE}
        />
      </section>
    </>
  );
}
