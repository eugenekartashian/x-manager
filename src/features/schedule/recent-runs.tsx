import type { OwnPost, ScheduledRepost } from "@/generated/prisma/client";
import { formatDay, formatTime } from "./labels";

type Run = ScheduledRepost & { ownPost: OwnPost | null };

const STATUS: Record<ScheduledRepost["status"], { label: string; tone: string }> = {
  SUCCEEDED: { label: "Reposted", tone: "bg-green-500/10 text-green-700 dark:text-green-400" },
  SKIPPED: { label: "Skipped", tone: "bg-foreground/10 text-foreground/70" },
  FAILED: { label: "Failed", tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
  UNKNOWN: { label: "Check on X", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  PROCESSING: { label: "Running…", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
};

const REASONS: Record<string, string> = {
  dry_run: "dry run — live Reposts are off",
  budget_exceeded: "monthly budget reached",
  not_connected: "X not connected",
  needs_reconnect: "X needs reconnecting",
  daily_cap: "daily limit reached",
  interval: "post reposted too recently",
  empty_list: "repost list is empty",
  no_post: "post not available",
  not_found: "post was deleted on X — removed from the list",
  no_credits: "X API credits exhausted",
  rate_limited: "X rate limit",
  forbidden: "X refused the Repost",
  unknown_outcome: "X did not confirm — open the post to check",
  interrupted: "interrupted — open the post to check",
};

export function RecentRuns({ runs, timeZone }: { runs: Run[]; timeZone: string }) {
  if (runs.length === 0) {
    return <p className="text-foreground/60 text-sm">No runs yet.</p>;
  }
  return (
    <ol className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {runs.map((run) => {
        const status = STATUS[run.status];
        const reason = run.skipReason ?? run.errorCode;
        const text = run.ownPost?.text.replace(/\s+/g, " ").trim();
        return (
          <li key={run.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="w-36 shrink-0 tabular-nums">
              {formatDay(run.runAt, timeZone)}, {formatTime(run.runAt, timeZone)}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${status.tone}`}>
              {status.label}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {text ?? run.xPostId ?? "—"}
              {reason && <span className="text-foreground/60"> · {REASONS[reason] ?? reason}</span>}
            </span>
            {run.xPostId && (
              <a
                href={`https://x.com/i/status/${run.xPostId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline-offset-2 hover:underline"
              >
                Open on X ↗
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
