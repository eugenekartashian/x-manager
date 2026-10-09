"use client";

import { useState, useTransition } from "react";
import { checkCreatorAction, type CreatorCheckResult } from "./outreach-actions";

/** "Did @x repost?" on the creator page — one exact X search, only on click. */
export function CheckRepostButton({
  targetId,
  username,
  postUrl,
  cost,
}: {
  targetId: string;
  username: string;
  postUrl: string;
  cost: string | null; // superadmin only
}) {
  const [result, setResult] = useState<CreatorCheckResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await checkCreatorAction(targetId)))}
          className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? "Checking…" : `Did @${username} repost?`}
        </button>
        <span className="text-foreground/50 text-xs">
          Checks{" "}
          <a href={postUrl} target="_blank" rel="noopener noreferrer" className="underline">
            the post you sent
          </a>
          {cost ? ` · up to ${cost}` : ""}
        </span>
      </div>
      {result &&
        (result.ok ? (
          result.found ? (
            <p className="text-green-700 dark:text-green-400">
              ✓ Yes — they {result.kind === "quote" ? "quoted" : "reposted"} it.{" "}
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Open ↗
                </a>
              )}
            </p>
          ) : (
            <p className="text-foreground/70">Not yet. Try again later.</p>
          )
        ) : (
          <p role="alert" className="text-amber-700 dark:text-amber-400">
            {result.message}
          </p>
        ))}
    </div>
  );
}
