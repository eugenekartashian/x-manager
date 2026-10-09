import Link from "next/link";
import { replyBlockMessage } from "@/features/replies/block-message";
import { TargetPosts } from "@/features/replies/target-posts";
import { TargetsDisabled } from "@/features/targets/targets-disabled";
import { requireWorkspace } from "@/server/auth/session";
import { isAiEnabled } from "@/server/services/ai-replies";
import { getLimitsContext } from "@/server/services/limits";
import { getSessionData, MAX_REPLY_SESSION_CREATORS } from "@/server/services/replies";

// Reply to several selected creators on one page. Posts load only on click (≈ $0.03 each);
// every reply opens in X and the user posts it there (D-008).
export default async function ReplySelectedPage({ searchParams }: PageProps<"/targets/reply">) {
  const { workspace, role } = await requireWorkspace();
  const { limits } = await getLimitsContext(workspace.id);
  if (limits && !limits.targetsEnabled) return <TargetsDisabled />;
  const raw = (await searchParams).ids;
  const ids = (typeof raw === "string" ? raw.split(",") : [])
    .filter(Boolean)
    .slice(0, MAX_REPLY_SESSION_CREATORS);
  const now = new Date();
  const sessions = (await Promise.all(ids.map((id) => getSessionData(workspace, id, now)))).filter(
    (session) => session !== null,
  );
  const aiEnabled = isAiEnabled() && (limits?.aiEnabled ?? true);
  const first = sessions[0];

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/targets" className="text-foreground/60 text-sm hover:underline">
          ← Creators
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Reply to selected</h1>
        <p className="text-foreground/70 text-sm">
          Load a creator&apos;s latest posts, pick one, write a reply (or ask AI) — it opens in X
          and you post it there.
          {first && (
            <>
              {" "}
              Replies today:{" "}
              <strong className="tabular-nums">
                {first.repliesToday}/{first.limits.perDay}
              </strong>{" "}
              · max 1 reply per creator per {first.limits.cooldownHours} h.
            </>
          )}
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-8 text-center text-sm">
          Nobody selected. Select creators in the{" "}
          <Link href="/targets" className="underline">
            Creators
          </Link>{" "}
          table first.
        </p>
      ) : (
        sessions.map((session) => (
          <div
            key={session.target.id}
            className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4"
          >
            <TargetPosts
              target={session.target}
              posts={session.posts}
              templates={session.templates.map((template) => template.text)}
              blockMessage={replyBlockMessage(session, workspace.timezone)}
              aiEnabled={aiEnabled}
              showCosts={role === "SUPERADMIN"}
              timeZone={workspace.timezone}
              now={now}
              title={
                <h2 className="text-lg font-medium">
                  <Link href={`/targets/${session.target.id}`} className="hover:underline">
                    {session.target.name}
                  </Link>{" "}
                  <span className="text-foreground/50 text-base font-normal">
                    @{session.target.username}
                  </span>
                </h2>
              }
            />
          </div>
        ))
      )}
    </>
  );
}
