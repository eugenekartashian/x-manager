import Link from "next/link";
import { ReplyLimitsForm } from "@/features/replies/limits-form";
import { RecentReplies } from "@/features/replies/recent-replies";
import { TemplatesSection } from "@/features/replies/templates-section";
import { AddTargetsForm } from "@/features/targets/add-targets-form";
import { CreatorsFilters } from "@/features/targets/creators-filters";
import { CreatorsTable } from "@/features/targets/creators-table";
import { ImportFile } from "@/features/targets/import-file";
import { QuickAddHelp } from "@/features/targets/quick-add-help";
import { RepostOverview } from "@/features/targets/repost-overview";
import { TargetsDisabled } from "@/features/targets/targets-disabled";
import { ConnectXFirst } from "@/features/x-account/connect-x-first";
import { env } from "@/lib/env";
import { canSendDirectMessages } from "@/server/integrations/x/oauth";
import { findConnection } from "@/server/repositories/x-accounts";
import { requireWorkspace } from "@/server/auth/session";
import {
  REPLY_COOLDOWN_HOUR_OPTIONS,
  REPLY_DAILY_LIMIT_OPTIONS,
} from "@/server/domain/reply-rules";
import { formatUsd } from "@/lib/format";
import { listCreators, parseCreatorFilters } from "@/server/services/creators";
import { getRepostOverview, maxBatchCostMicros } from "@/server/services/repost-checks";
import { getLimits } from "@/server/services/limits";
import { listRecentReplies, listTemplates } from "@/server/services/replies";
import { MAX_TARGETS } from "@/server/services/targets";
import { connectedXUserId } from "@/server/services/x-api";

// Creators (Collab CRM, M7.1): the people you reply to and collaborate with. Route stays
// /targets so existing links and the iPhone Shortcut keep working.
export default async function CreatorsPage({ searchParams }: PageProps<"/targets">) {
  const { workspace, role } = await requireWorkspace();
  const limits = await getLimits(workspace.id);
  if (limits && !limits.targetsEnabled) return <TargetsDisabled />;
  const connected = await connectedXUserId(workspace.id);
  if (!connected.ok) {
    return (
      <ConnectXFirst
        title="Creators"
        message="Connect your X account first — account lookups use your X connection."
      />
    );
  }

  const params = await searchParams;
  const filters = parseCreatorFilters(params);
  const [page, templates, replies, reposts, connection] = await Promise.all([
    listCreators(workspace.id, filters),
    listTemplates(workspace.id),
    listRecentReplies(workspace.id),
    getRepostOverview(workspace.id),
    findConnection(workspace.id),
  ]);
  const all = Object.values(page.counts).reduce((sum, count) => sum + count, 0);
  const cap = Math.min(MAX_TARGETS, limits?.targets ?? MAX_TARGETS);
  const filtered = Boolean(
    filters.status || filters.q || filters.tag || filters.role || filters.owed,
  );

  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "page") next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `/targets?${query}` : "/targets";
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Creators{" "}
          <span className="text-foreground/40 text-lg font-normal">
            {all}/{cap}
          </span>
        </h1>
        <p className="text-foreground/70 text-sm">
          Accounts you reply to and collaborate with. Everything you post on X — replies, messages,
          Reposts — you do yourself; this list keeps track.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <AddTargetsForm showCosts={role === "SUPERADMIN"} />
        <div className="flex flex-wrap items-start gap-3">
          <ImportFile />
          {all > 0 && (
            // Plain link: a file download, not a page navigation.
            <a
              href="/api/targets/export"
              className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1.5 text-sm"
            >
              Export CSV
            </a>
          )}
        </div>
        <QuickAddHelp appUrl={env.APP_URL} />
      </section>

      <RepostOverview
        waitingForThem={reposts.waitingForThem}
        waitingForMe={reposts.waitingForMe}
        maxCost={
          role === "SUPERADMIN"
            ? formatUsd(BigInt(maxBatchCostMicros(reposts.waitingForThem)))
            : null
        }
      />

      {filters.owed && (
        <p className="rounded-md bg-green-600/10 px-3 py-2 text-sm">
          Creators who reposted your post — repost one of theirs in X, then mark it on their page.{" "}
          <Link href="/targets" className="underline">
            Show everyone
          </Link>
        </p>
      )}

      <section className="flex flex-col gap-3">
        <CreatorsFilters
          counts={page.counts}
          total={all}
          tags={page.tags}
          owedCount={reposts.waitingForMe}
        />
        <CreatorsTable
          rows={page.rows}
          timeZone={workspace.timezone}
          filtered={filtered}
          bulkMessage={role === "SUPERADMIN" && canSendDirectMessages(connection?.scopes ?? "")}
        />
        {page.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            {filters.page > 1 ? (
              <Link
                href={pageHref(filters.page - 1)}
                scroll={false}
                className="hover:bg-foreground/5 rounded-md px-3 py-1.5"
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-foreground/60">
              Page {filters.page} of {page.pages} · {page.total} creators
            </span>
            {filters.page < page.pages ? (
              <Link
                href={pageHref(filters.page + 1)}
                scroll={false}
                className="hover:bg-foreground/5 rounded-md px-3 py-1.5"
              >
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      <details className="border-foreground/10 rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Reply templates{role === "SUPERADMIN" && " & limits"}
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <TemplatesSection templates={templates} />
          {role === "SUPERADMIN" && (
            <div className="flex flex-col gap-3">
              <h3 className="font-medium">Reply limits</h3>
              <ReplyLimitsForm
                cooldownHours={workspace.replyCooldownHours}
                perDay={workspace.replyDailyLimit}
                cooldownOptions={REPLY_COOLDOWN_HOUR_OPTIONS}
                dailyOptions={REPLY_DAILY_LIMIT_OPTIONS}
              />
            </div>
          )}
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent replies</h2>
        <RecentReplies replies={replies} timeZone={workspace.timezone} />
      </section>
    </>
  );
}
