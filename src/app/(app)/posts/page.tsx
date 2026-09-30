import Link from "next/link";
import { AddPostForm } from "@/features/posts/add-post-form";
import { ConnectXFirst } from "@/features/x-account/connect-x-first";
import { errorMessage } from "@/features/posts/messages";
import { RecentPostsList } from "@/features/posts/recent-posts-list";
import { RefreshPostsForm } from "@/features/posts/refresh-posts-form";
import { RotationList } from "@/features/posts/rotation-list";
import { formatDateTime, formatUsd } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/session";
import { USER_REPOST_INTERVAL_MINUTES } from "@/server/domain/user-limits";
import { getPostsPageData, listCap, REFRESH_ESTIMATE_MICROS } from "@/server/services/own-posts";

export default async function PostsPage() {
  const { workspace, role } = await requireWorkspace();
  const showCosts = role === "SUPERADMIN";
  const intervalMinutes = showCosts
    ? workspace.perPostMinIntervalMinutes
    : USER_REPOST_INTERVAL_MINUTES;
  const now = new Date();
  const [data, cap] = await Promise.all([
    getPostsPageData(workspace.id, now),
    listCap(workspace.id),
  ]);
  const timeZone = workspace.timezone;

  if (!data.connected) {
    return <ConnectXFirst title="Posts" message={errorMessage(data.reason)} />;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
        {showCosts && (
          <p className="text-foreground/70 text-sm">
            API spend this month (estimate): {formatUsd(data.budget.spentMicros)} of{" "}
            {formatUsd(data.budget.budgetMicros)}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">
            Repost list{" "}
            <span className="text-foreground/50">
              ({data.rotation.length}/{cap})
            </span>
          </h2>
          <p className="text-foreground/70 text-sm">
            At every daily time, all posts in this list are reposted. They go out in list order: #1
            first, the last one ends up on top of your timeline. Each post is reposted at most once
            every {intervalMinutes / 60} h — set times{showCosts && " and limits"} on the{" "}
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
          minIntervalMs={intervalMinutes * 60_000}
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
          <RefreshPostsForm
            costLabel={showCosts ? formatUsd(BigInt(REFRESH_ESTIMATE_MICROS)) : undefined}
          />
        </div>
        <RecentPostsList
          posts={data.recent}
          timeZone={timeZone}
          listCap={cap}
          listFull={data.rotation.length >= cap}
        />
      </section>
    </>
  );
}
