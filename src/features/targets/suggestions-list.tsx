"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { formatCount } from "@/lib/format";
import { addSuggestionsAction, skipSuggestionsAction } from "./discovery-actions";

type Suggestion = {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  followers: number | null;
  followsYou: boolean | null;
  youFollow: boolean | null;
  via: string;
};

/** Pick suggestions to add to Creators or skip for good. */
export function SuggestionsList({ suggestions }: { suggestions: Suggestion[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = [...selected];
  const allSelected = suggestions.every((item) => selected.has(item.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function run(kind: "add" | "skip", targetIds: string[]) {
    setNotice(null);
    startTransition(async () => {
      const result =
        kind === "add"
          ? await addSuggestionsAction(targetIds)
          : await skipSuggestionsAction(targetIds);
      if (result.ok) {
        setSelected(new Set());
        setNotice({
          ok: true,
          text: kind === "add" ? `Added ${result.count} to Creators.` : `Skipped ${result.count}.`,
        });
      } else {
        setNotice({ ok: false, text: result.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-1 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(suggestions.map((item) => item.id)))
            }
            className="size-4"
          />
          Select all ({suggestions.length})
        </label>
        <button
          type="button"
          disabled={pending || ids.length === 0}
          onClick={() => run("add", ids)}
          className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          Add {ids.length || ""} to Creators
        </button>
        <button
          type="button"
          disabled={pending || ids.length === 0}
          onClick={() => run("skip", ids)}
          className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Skip {ids.length || ""}
        </button>
        {notice && (
          <span
            role={notice.ok ? "status" : "alert"}
            className={`text-sm ${notice.ok ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
          >
            {notice.text}
          </span>
        )}
      </div>

      <ul className="divide-foreground/10 border-foreground/10 divide-y rounded-lg border">
        {suggestions.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-3 px-3 py-2.5 ${selected.has(item.id) ? "bg-foreground/4" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              aria-label={`Select @${item.username}`}
              className="mt-2.5 size-4"
            />
            <span className="bg-foreground/10 relative size-9 shrink-0 overflow-hidden rounded-full">
              {item.avatarUrl && (
                <Image
                  src={item.avatarUrl}
                  alt=""
                  fill
                  sizes="36px"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium break-words">
                {item.name}
                <a
                  href={`https://x.com/${item.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/60 text-xs font-normal hover:underline"
                >
                  @{item.username} ↗
                </a>
                {(item.followsYou || item.youFollow) && (
                  <span className="text-foreground/70 bg-foreground/10 rounded px-1.5 text-[11px] font-normal">
                    {item.followsYou ? (item.youFollow ? "Mutual" : "Follows you") : "You follow"}
                  </span>
                )}
              </span>
              {item.bio && (
                <span className="text-foreground/60 line-clamp-2 block text-xs break-words">
                  {item.bio}
                </span>
              )}
              <span className="text-foreground/40 block text-[11px]">via @{item.via}</span>
            </span>
            <span className="text-sm tabular-nums">{formatCount(item.followers)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
