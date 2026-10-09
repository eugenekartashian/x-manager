"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/select";
import { draftMessagesAction, recordSentAction, undoMessageAction } from "./outreach-actions";

type PostOption = { url: string; label: string };

type Props = {
  targetId: string;
  username: string;
  /** Direct link to the 1:1 X chat (built on the server from both user ids). */
  chatLink: string;
  posts: PostOption[];
  aiEnabled: boolean;
  usedToday: number;
  dailyLimit: number;
};

const control =
  "border-foreground/15 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * Write one personal message → copy it and open the X chat; the user pastes and sends it.
 * Only "Yes, sent" records anything (history, status, daily count) — D-033.
 */
export function MessageComposer({
  targetId,
  username,
  chatLink,
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
  const [opened, setOpened] = useState<{ copiedOk: boolean; blocked: boolean } | null>(null);
  const [sent, setSent] = useState<{ eventId: string } | null>(null);
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
    // X can't prefill chat text (verified 2026-10-09), so the message is copied first —
    // synchronously, before the new tab takes focus — and nothing is recorded yet.
    const copiedOk = copySync(text);
    // No "noopener" feature: with it window.open always returns null. Cut the opener instead.
    const tab = window.open(chatLink, "_blank");
    if (tab) tab.opener = null;
    setOpened({ copiedOk, blocked: !tab });
  }

  function confirmSent() {
    setError(null);
    startTransition(async () => {
      const result = await recordSentAction({ targetId, text, postUrl: link || undefined });
      if (result.ok) {
        setSent({ eventId: result.eventId });
        setOpened(null);
      } else {
        setError(result.message);
      }
    });
  }

  function reset() {
    setOpened(null);
    setSent(null);
    setText("");
    setDrafts([]);
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

  if (sent) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-green-500/10 px-3 py-3 text-sm">
        <p className="font-medium text-green-800 dark:text-green-300">
          ✓ Saved — @{username} is “Messaged”. Change the status above when they repost.
        </p>
        <div className="flex gap-4 text-xs">
          <button type="button" onClick={reset} className="text-foreground/70 underline">
            Write another message
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (await undoMessageAction({ eventId: sent.eventId, targetId })) setSent(null);
              })
            }
            className="text-foreground/50 underline"
          >
            Undo
          </button>
        </div>
      </div>
    );
  }

  if (opened) {
    return (
      <div className="flex flex-col gap-3 rounded-md bg-blue-500/10 px-3 py-3 text-sm">
        <p className="font-medium">
          {opened.copiedOk
            ? "Text copied ✓ — now click the message box in the X chat with @" +
              username +
              " and paste it (⌘V), then send."
            : "Copy the text below and paste it into the chat with @" + username + "."}
        </p>
        <p className="text-foreground/70 text-xs">
          X can&apos;t fill the chat for us — the text is in your clipboard. Paste: ⌘V / Ctrl+V on a
          computer, long-press → Paste on the phone. If the chat didn&apos;t open,{" "}
          <a
            href={`https://x.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            open their profile ↗
          </a>{" "}
          → Message.{" "}
          <button type="button" onClick={copy} className="underline">
            {copied ? "Copied ✓" : "Copy again"}
          </button>
        </p>
        <a
          href={chatLink}
          target="_blank"
          rel="noopener noreferrer"
          className={`self-start text-sm underline ${opened.blocked ? "font-semibold" : "text-foreground/70"}`}
        >
          {opened.blocked ? "Open the chat with @" + username + " ↗" : "Open the chat again ↗"}
        </a>
        <p className="font-medium">Did you send it?</p>
        {error && (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={confirmSent}
            className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "✓ Yes, sent"}
          </button>
          <button
            type="button"
            onClick={() => setOpened(null)}
            className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1.5 text-sm"
          >
            Not yet
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
        <Select value={postUrl} onChange={(event) => setPostUrl(event.target.value)}>
          <option value="">No post</option>
          {posts.map((post) => (
            <option key={post.url} value={post.url}>
              {post.label}
            </option>
          ))}
          <option value="custom">Paste a link…</option>
        </Select>
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
          disabled={limitReached || !text.trim()}
          className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          Copy & open chat ↗
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

/** Synchronous copy that works inside a click even if a new tab opens right after. */
function copySync(value: string): boolean {
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, value.length); // iOS
  let ok = false;
  try {
    // Deprecated but still the only synchronous copy; the Clipboard API is async.
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(field);
  if (!ok) void navigator.clipboard?.writeText(value).catch(() => undefined);
  return ok;
}
