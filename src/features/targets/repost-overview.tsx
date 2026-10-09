"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { checkAllWaitingAction } from "./outreach-actions";

type Props = {
  waitingForThem: number;
  waitingForMe: number;
  /** Worst-case price of "Check all", superadmin only (users never see prices). */
  maxCost: string | null;
};

/** Who we're waiting for, who's waiting for us, and a manual "Check all waiting" (M7.3). */
export function RepostOverview({ waitingForThem, waitingForMe, maxCost }: Props) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
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
        {waitingForThem > 0 && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="border-foreground/15 hover:bg-foreground/5 ml-auto rounded-md border px-3 py-1.5"
          >
            Check all waiting ({waitingForThem})
          </button>
        )}
        {confirming && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-foreground/70 text-xs">
              One exact X check per creator{maxCost ? ` · up to ${maxCost}` : ""}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await checkAllWaitingAction();
                  setMessage({ ok: result.ok, text: result.message });
                  setConfirming(false);
                })
              }
              className="bg-foreground text-background rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
            >
              {pending ? "Checking…" : "Check"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-foreground/60 px-1"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
      <p className="text-foreground/50 text-xs">
        Checks run only when you click — nothing is read from X automatically.
      </p>
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
