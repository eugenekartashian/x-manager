import Link from "next/link";
import { notFound } from "next/navigation";
import { BulkMessage } from "@/features/targets/bulk-message";
import { requireWorkspace } from "@/server/auth/session";
import { MAX_BULK_MESSAGES } from "@/server/domain/outreach-rules";
import { canSendDirectMessages } from "@/server/integrations/x/oauth";
import { findConnection } from "@/server/repositories/x-accounts";
import { bulkCandidates, messagePostOptions, messagesToday } from "@/server/services/outreach";

const SKIP_LABELS = {
  declined: "marked Declined",
  recently_messaged: "messaged in the last 7 days",
} as const;

// Bulk messages via the X API — superadmin experiment (D-035).
export default async function BulkMessagePage({ searchParams }: PageProps<"/targets/message">) {
  const { workspace, role } = await requireWorkspace();
  if (role !== "SUPERADMIN") notFound();
  const connection = await findConnection(workspace.id);
  const now = new Date();

  if (!connection || !canSendDirectMessages(connection.scopes)) {
    return (
      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">
        Sending through the X API needs message permission — disconnect and connect X again on the{" "}
        <Link href="/" className="underline">
          dashboard
        </Link>
        .
      </p>
    );
  }

  const raw = (await searchParams).ids;
  const ids = (typeof raw === "string" ? raw.split(",") : []).filter(Boolean);
  const [candidates, posts, messages] = await Promise.all([
    bulkCandidates(workspace.id, ids, now),
    messagePostOptions(workspace.id, connection.username, now),
    messagesToday(workspace, now),
  ]);
  const left = Math.max(0, messages.limit - messages.used);

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/targets" className="text-foreground/60 text-sm hover:underline">
          ← Creators
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Message selected</h1>
        <p className="text-foreground/70 text-sm">
          AI writes a different message for each creator. Check them, then “Send all” sends them
          through the X API one after another ($0.015 each). Up to {MAX_BULK_MESSAGES} at once;{" "}
          {left} of {messages.limit} messages left today.
        </p>
      </div>

      {candidates.skipped.length > 0 && (
        <ul className="text-foreground/60 flex flex-col gap-0.5 text-sm">
          {candidates.skipped.map(({ creator, reason }) => (
            <li key={creator.id}>
              Skipped @{creator.username} — {SKIP_LABELS[reason]}
            </li>
          ))}
        </ul>
      )}

      {candidates.ready.length === 0 ? (
        <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-8 text-center text-sm">
          Nobody to message. Select creators in the{" "}
          <Link href="/targets" className="underline">
            Creators
          </Link>{" "}
          table first.
        </p>
      ) : (
        <BulkMessage
          creators={candidates.ready.map((creator) => ({
            id: creator.id,
            username: creator.username,
            name: creator.name,
            followsYou: creator.followsYou,
            youFollow: creator.youFollow,
          }))}
          posts={posts}
          left={left}
        />
      )}
    </>
  );
}
