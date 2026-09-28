import Link from "next/link";
import { RecentReplies } from "@/features/replies/recent-replies";
import { TemplatesSection } from "@/features/replies/templates-section";
import { AddTargetsForm } from "@/features/targets/add-targets-form";
import { TargetList } from "@/features/targets/target-list";
import { ConnectXFirst } from "@/features/x-account/connect-x-first";
import { requireWorkspace } from "@/server/auth/session";
import type { TargetSort } from "@/server/repositories/targets";
import { listRecentReplies, listTemplates } from "@/server/services/replies";
import { listTargets, MAX_TARGETS } from "@/server/services/targets";
import { connectedXUserId } from "@/server/services/x-api";

export default async function TargetsPage({ searchParams }: PageProps<"/targets">) {
  const { workspace } = await requireWorkspace();
  const connected = await connectedXUserId(workspace.id);
  if (!connected.ok) {
    return (
      <ConnectXFirst
        title="Targets"
        message="Connect your X account first — account lookups use your X connection."
      />
    );
  }

  const { sort: rawSort } = await searchParams;
  const sort: TargetSort = rawSort === "recent" ? "recent" : "followers";
  const [targets, templates, replies] = await Promise.all([
    listTargets(workspace.id, sort),
    listTemplates(workspace.id),
    listRecentReplies(workspace.id),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Targets</h1>
        <p className="text-foreground/70 text-sm">
          Niche accounts you want to reply to. X does not allow apps to reply to other accounts, so
          replies are always posted by you on x.com — this list keeps them organised.
        </p>
      </div>

      <AddTargetsForm />

      <TemplatesSection templates={templates} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">
            Target list{" "}
            <span className="text-foreground/50">
              ({targets.length}/{MAX_TARGETS})
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/targets"
              aria-current={sort === "followers" ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${sort === "followers" ? "bg-foreground text-background" : "hover:bg-foreground/5"}`}
            >
              Most followers
            </Link>
            <Link
              href="/targets?sort=recent"
              aria-current={sort === "recent" ? "page" : undefined}
              className={`rounded-md px-3 py-1 ${sort === "recent" ? "bg-foreground text-background" : "hover:bg-foreground/5"}`}
            >
              Recently added
            </Link>
            {targets.length > 0 && (
              // Plain link: a file download, not a page navigation.
              <a
                href="/api/targets/export"
                className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1"
              >
                Export CSV
              </a>
            )}
          </div>
        </div>
        <TargetList targets={targets} timeZone={workspace.timezone} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent replies</h2>
        <RecentReplies replies={replies} timeZone={workspace.timezone} />
      </section>
    </>
  );
}
