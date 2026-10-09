"use client";

import { useState, useTransition } from "react";
import { draftMessagesAction, openMessageAction, undoMessageAction } from "./outreach-actions";

type PostOption = { url: string; label: string };

type Props = {
  targetId: string;
  username: string;
  posts: PostOption[];
  aiEnabled: boolean;
  usedToday: number;
  dailyLimit: number;
};

const control =
  "border-foreground/15 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

/** Write one personal message → open X's DM composer with it. The user sends it (D-033). */
export function MessageComposer({
  targetId,
  username,
  posts,
  aiEnabled,
  usedToday,
  dailyLimit,
}: Props) {
  const [postUrl, setPostUrl] = useState(posts[0]?.url ?? "");
  const [customUrl, setCustomUrl] = useState("");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ eventId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [aiPending, startAi] = useTransition();
  const link = postUrl === "custom" ? customUrl.trim() : postUrl;
  const limitReached = usedToday >= dailyLimit;

  function askAi() {
    setError(null);
    startAi(async () => {
      const result = await draftMessagesAction({ targetId, postUrl: link || undefined });
      if (result.ok) setDrafts(result.drafts);
      else setError(result.message);
    });
  }

  function openInX() {
    setError(null);
    // Open the tab inside the click so popup blockers allow it.
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await openMessageAction({ targetId, text, postUrl: link || undefined });
      if (result.ok) {
        if (tab) {
          tab.opener = null;
          tab.location.href = result.intentUrl;
        } else {
          window.location.href = result.intentUrl;
        }
        setOpened({ eventId: result.eventId });
      } else {
        tab?.close();
        setError(result.message);
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Couldn't copy — select the text and copy it manually.");
    }
  }

  if (opened) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-green-500/10 px-3 py-3 text-sm">
        <p className="font-medium text-green-800 dark:text-green-300">
          Opened in X — send it there. @{username} is now “Messaged”.
        </p>
        <p className="text-foreground/70">
          If X didn&apos;t open the chat,{" "}
          <button type="button" onClick={copy} className="underline">
            {copied ? "copied ✓" : "copy the text"}
          </button>{" "}
          and{" "}
          <a
            href={`https://x.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            open their profile ↗
          </a>{" "}
          → Message.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                if (await undoMessageAction({ eventId: opened.eventId, targetId })) setOpened(null);
              })
            }
            className="text-foreground/70 text-xs underline"
          >
            Didn&apos;t send it? Undo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Your post to share{" "}
        <span className="text-foreground/50 text-xs">
          (optional — the link goes into the message)
        </span>
        <select
          value={postUrl}
          onChange={(event) => setPostUrl(event.target.value)}
          className={control}
        >
          <option value="">No post</option>
          {posts.map((post) => (
            <option key={post.url} value={post.url}>
              {post.label}
            </option>
          ))}
          <option value="custom">Paste a link…</option>
        </select>
      </label>
      {postUrl === "custom" && (
        <input
          value={customUrl}
          onChange={(event) => setCustomUrl(event.target.value)}
          placeholder="https://x.com/you/status/…"
          aria-label="Post link"
          className={control}
        />
      )}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        maxLength={1_000}
        placeholder={`Hi @${username}! …`}
        aria-label="Message"
        className={control}
      />
      {drafts.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="AI drafts">
          {drafts.map((draft) => (
            <li key={draft}>
              <button
                type="button"
                onClick={() => setText(draft)}
                className={`hover:bg-foreground/5 w-full rounded-md border px-3 py-2 text-left text-sm whitespace-pre-line ${
                  draft === text ? "border-foreground/40 bg-foreground/5" : "border-foreground/10"
                }`}
              >
                ✨ {draft}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openInX}
          disabled={pending || limitReached || !text.trim()}
          className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Opening…" : "Open in X ↗"}
        </button>
        {aiEnabled && (
          <button
            type="button"
            onClick={askAi}
            disabled={aiPending}
            className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {aiPending ? "Writing…" : drafts.length ? "✨ More drafts" : "✨ AI drafts"}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          disabled={!text.trim()}
          className="text-foreground/70 hover:bg-foreground/5 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
        >
          {copied ? "Copied ✓" : "Copy text"}
        </button>
        <span className="text-foreground/50 ml-auto text-xs tabular-nums">
          {usedToday}/{dailyLimit} messages today
        </span>
      </div>
      {limitReached && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Daily message limit reached — it keeps your account safe. Try again tomorrow.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          {error}
        </p>
      )}
    </div>
  );
}
