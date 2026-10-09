"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { checkRepostsNowAction } from "./outreach-actions";

type Props = {
  waitingForThem: number;
  waitingForMe: number;
  lastChecked: string | null; // formatted on the server
};

/** Who we're waiting for, who's waiting for us, and a manual "Check now" (M7.3). */
export function RepostOverview({ waitingForThem, waitingForMe, lastChecked }: Props) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (waitingForThem === 0 && waitingForMe === 0) return null;

  return (
    <section className="border-foreground/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Waiting for their repost: <strong className="tabular-nums">{waitingForThem}</strong>
        </span>
        {waitingForMe > 0 ? (
          <Link
            href="/targets?owed=1"
            className="rounded-full bg-green-600/10 px-2.5 py-0.5 font-medium text-green-700 dark:text-green-400"
          >
            {waitingForMe} waiting for your repost →
          </Link>
        ) : (
          <span className="text-foreground/60">Nobody waiting for your repost</span>
        )}
        <span className="text-foreground/50 text-xs">
          {lastChecked ? `Checked ${lastChecked}` : "Not checked yet"} · checks run daily
        </span>
        {waitingForThem > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await checkRepostsNowAction();
                setMessage({ ok: result.ok, text: result.message });
              })
            }
            className="border-foreground/15 hover:bg-foreground/5 ml-auto rounded-md border px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "Checking…" : "Check now"}
          </button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={
            message.ok ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"
          }
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
