"use client";

import { useState, useTransition } from "react";
import { openReplyAction } from "./actions";

type Props = {
  targetId: string;
  xPostId: string;
  templates: string[];
  disabledReason: string | null;
};

function pick(templates: string[], previous?: string): string {
  const pool = templates.length > 1 ? templates.filter((text) => text !== previous) : templates;
  return pool[Math.floor(Math.random() * pool.length)] ?? "";
}

/** Reply text + "Open in X". The app never posts — X's composer opens with the text. */
export function ReplyComposer({ targetId, xPostId, templates, disabledReason }: Props) {
  const [text, setText] = useState(() => pick(templates));
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = pending || opened || disabledReason !== null;

  function open() {
    setError(null);
    // Open the tab synchronously (inside the click) so popup blockers allow it.
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await openReplyAction({ targetId, xPostId, text });
      if (result.ok) {
        if (tab) {
          tab.opener = null;
          tab.location.href = result.intentUrl;
        } else {
          window.location.href = result.intentUrl;
        }
        setOpened(true);
      } else {
        tab?.close();
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        maxLength={280}
        disabled={opened}
        aria-label="Reply text"
        placeholder="Write your reply…"
        className="border-foreground/15 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={open}
          disabled={disabled || text.trim().length === 0}
          className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          {pending ? "Opening…" : opened ? "Opened in X ✓" : "Open in X ↗"}
        </button>
        {templates.length > 1 && !opened && (
          <button
            type="button"
            onClick={() => setText((current) => pick(templates, current))}
            className="text-foreground/70 hover:bg-foreground/5 rounded-md px-2 py-1 text-sm"
          >
            ↻ Another template
          </button>
        )}
        <span className="text-foreground/50 text-xs tabular-nums">{text.length}/280</span>
      </div>
      {opened && (
        <p className="text-foreground/70 text-xs">
          Attach your photo/video in X, then post. Didn’t post it? Use “Undo” below so it doesn’t
          count.
        </p>
      )}
      {(error ?? disabledReason) && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          {error ?? disabledReason}
        </p>
      )}
    </div>
  );
}
