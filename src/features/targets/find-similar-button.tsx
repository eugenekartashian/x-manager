"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { findSimilarAction, type FindSimilarResult } from "./discovery-actions";

/** "Find similar" on the creator page: reads who this creator follows (≤ 100, on click). */
export function FindSimilarButton({
  targetId,
  username,
  maxCost,
  finished,
}: {
  targetId: string;
  username: string;
  maxCost: string;
  /** Their whole following list was already read. */
  finished: boolean;
}) {
  const [result, setResult] = useState<FindSimilarResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (
      !window.confirm(
        `Read up to 100 accounts @${username} follows (≤ ${maxCost}) and suggest the ones with 10K+ followers?`,
      )
    ) {
      return;
    }
    startTransition(async () => setResult(await findSimilarAction(targetId)));
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || finished}
          onClick={run}
          className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? "Looking…" : "Find similar creators"}
        </button>
        <span className="text-foreground/50 text-xs">
          {finished
            ? `Everyone @${username} follows was checked.`
            : `From who @${username} follows · up to ${maxCost} per run`}
        </span>
      </div>
      {result &&
        (result.ok ? (
          <p className="text-foreground/80">
            Read {result.read}: <strong>{result.suggested} new suggestions</strong>
            {result.alreadyKnown > 0 && ` · ${result.alreadyKnown} already known`}
            {result.tooSmall > 0 && ` · ${result.tooSmall} under 10K followers`}
            {result.finished && " · that was the last of their list"}.{" "}
            {result.suggested > 0 && (
              <Link href="/targets/suggestions" className="underline">
                Review suggestions →
              </Link>
            )}
          </p>
        ) : (
          <p role="alert" className="text-amber-700 dark:text-amber-400">
            {result.message}
          </p>
        ))}
    </div>
  );
}
