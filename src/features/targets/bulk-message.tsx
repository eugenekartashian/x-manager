"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Select } from "@/components/ui/select";
import { draftBulkAction, sendBulkAction } from "./outreach-actions";

type Creator = { id: string; username: string; name: string };
type PostOption = { url: string; label: string };
type Row = { text: string; error: string | null; include: boolean };
type Outcome = { ok: boolean; message: string | null };

type Props = { creators: Creator[]; posts: PostOption[]; left: number };

const control =
  "border-foreground/15 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * Bulk messages (superadmin, D-035): AI drafts one message per creator on open, the owner
 * reviews them, one "Send all" click sends them via the X API one after another.
 */
export function BulkMessage({ creators, posts, left }: Props) {
  const [postUrl, setPostUrl] = useState(posts[0]?.url ?? "");
  const [draftedFor, setDraftedFor] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [error, setError] = useState<string | null>(null);
  const [writing, startWriting] = useTransition();
  const [sending, startSending] = useTransition();
  const started = useRef(false);

  function write(forPost: string) {
    setError(null);
    startWriting(async () => {
      const drafts = await draftBulkAction({
        targetIds: creators.map((creator) => creator.id),
        postUrl: forPost || undefined,
      });
      if (drafts.length === 0) {
        setError("AI drafts are not available. Write the messages yourself.");
      }
      setRows((current) => {
        const next = { ...current };
        for (const creator of creators) {
          const draft = drafts.find((item) => item.targetId === creator.id);
          next[creator.id] = {
            text: draft?.text ?? current[creator.id]?.text ?? "",
            error: draft?.error ?? null,
            include: current[creator.id]?.include ?? true,
          };
        }
        return next;
      });
      setDraftedFor(forPost);
    });
  }

  useEffect(() => {
    // Draft once when the page opens (the owner chose these creators a click ago).
    if (started.current) return;
    started.current = true;
    write(postUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, []);

  const update = (id: string, change: Partial<Row>) =>
    setRows((current) => ({
      ...current,
      [id]: { text: "", error: null, include: true, ...current[id], ...change },
    }));

  const toSend = creators.filter((creator) => {
    const row = rows[creator.id];
    return row?.include && row.text.trim() && !outcomes[creator.id]?.ok;
  });
  const overLimit = toSend.length > left;
  const done = Object.keys(outcomes).length > 0;

  function sendAll() {
    const lines = toSend.map((creator) => `@${creator.username}`).join(", ");
    const cost = (toSend.length * 0.015).toFixed(3);
    if (!window.confirm(`Send ${toSend.length} messages via the X API (≈ $${cost})?\n\n${lines}`)) {
      return;
    }
    setError(null);
    startSending(async () => {
      const result = await sendBulkAction({
        items: toSend.map((creator) => ({
          targetId: creator.id,
          text: rows[creator.id]?.text ?? "",
        })),
        postUrl: postUrl || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOutcomes((current) => {
        const next = { ...current };
        for (const item of result.results) next[item.targetId] = item;
        return next;
      });
    });
  }

  const sentCount = Object.values(outcomes).filter((item) => item.ok).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          Your post to share
          <Select
            value={postUrl}
            onChange={(event) => setPostUrl(event.target.value)}
            disabled={sending || done}
          >
            <option value="">No post</option>
            {posts.map((post) => (
              <option key={post.url} value={post.url}>
                {post.label}
              </option>
            ))}
          </Select>
        </label>
        {draftedFor !== null && draftedFor !== postUrl && !done && (
          <button
            type="button"
            onClick={() => write(postUrl)}
            disabled={writing}
            className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            ✨ Rewrite for this post
          </button>
        )}
      </div>
      {postUrl && (
        <p className="text-foreground/60 -mt-2 text-xs">
          The link to your post is added at the end of every message that doesn&apos;t have it.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {creators.map((creator) => {
          const row = rows[creator.id];
          const outcome = outcomes[creator.id];
          return (
            <li
              key={creator.id}
              className={`border-foreground/10 flex flex-col gap-2 rounded-lg border p-3 ${
                row && !row.include ? "opacity-50" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row?.include ?? true}
                  onChange={(event) => update(creator.id, { include: event.target.checked })}
                  disabled={sending || outcome?.ok}
                  aria-label={`Send to @${creator.username}`}
                  className="size-4"
                />
                <Link href={`/targets/${creator.id}`} className="font-medium hover:underline">
                  {creator.name}
                </Link>
                <span className="text-foreground/50">@{creator.username}</span>
                {outcome && (
                  <span
                    className={`ml-auto text-xs ${
                      outcome.ok
                        ? "text-green-700 dark:text-green-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {outcome.ok ? "✓ Sent" : outcome.message}
                  </span>
                )}
              </div>
              {row?.error && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{row.error}</p>
              )}
              <textarea
                value={row?.text ?? ""}
                onChange={(event) => update(creator.id, { text: event.target.value })}
                rows={3}
                maxLength={1_000}
                disabled={sending || outcome?.ok}
                placeholder={writing ? "✨ Writing…" : `Hi @${creator.username}! …`}
                aria-label={`Message to @${creator.username}`}
                className={control}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={sendAll}
          disabled={writing || sending || toSend.length === 0 || overLimit}
          className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {sending ? "Sending…" : `Send all (${toSend.length}) via X API`}
        </button>
        {writing && <span className="text-foreground/60 text-sm">✨ Writing messages…</span>}
        {done && (
          <span className="text-sm">
            Sent {sentCount}.{" "}
            <Link href="/targets?status=CONTACTED" className="underline">
              See Messaged creators
            </Link>
          </span>
        )}
      </div>
      {overLimit && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Only {left} messages left today — untick some creators.
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
