import Link from "next/link";
import { AddPostForm } from "@/features/posts/add-post-form";
import { errorMessage } from "@/features/posts/messages";
import { RecentPostsList } from "@/features/posts/recent-posts-list";
import { RefreshPostsForm } from "@/features/posts/refresh-posts-form";
import { RotationList } from "@/features/posts/rotation-list";
import { formatDateTime, formatUsd } from "@/lib/format";
import { requireWorkspace } from "@/server/auth/session";
import { getPostsPageData, REFRESH_ESTIMATE_MICROS } from "@/server/services/own-posts";

export default async function PostsPage() {
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const data = await getPostsPageData(workspace.id, now);
  const timeZone = workspace.timezone;

  if (!data.connected) {
    return (
      <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
        <h1 className="text-xl font-semibold">Posts</h1>
        <p className="text-foreground/70 text-sm">{errorMessage(data.reason)}</p>
        <Link
          href="/dashboard"
          className="self-start text-sm font-medium underline underline-offset-2"
        >
          Go to dashboard
        </Link>
      </section>
    );
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
          <h2 className="text-lg font-medium">Repost rotation</h2>
          <p className="text-foreground/70 text-sm">
            Your posts that scheduled Reposts pick from, in this order. A post is reposted at most
            once every 6 hours.
          </p>
        </div>
        <RotationList posts={data.rotation} timeZone={timeZone} now={now} />
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
        <RecentPostsList posts={data.recent} timeZone={timeZone} />
      </section>
    </>
  );
}
