"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CreatorStatus } from "@/generated/prisma/client";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS, ROLE_ORDER, STATUS_META, STATUS_ORDER } from "./creator-status";

type Props = {
  counts: Partial<Record<CreatorStatus, number>>;
  total: number;
  tags: string[];
};

const control =
  "border-foreground/15 rounded-md border bg-transparent px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none";

/** Status tabs + search / tag / sort. State lives in the URL (shareable, back button works). */
export function CreatorsFilters({ counts, total, tags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const status = params.get("status");

  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // any filter change starts from page 1
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const go = (changes: Record<string, string | null>) =>
    router.replace(hrefWith(changes), { scroll: false });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go({ q: search.trim() || null });
  }

  const tabs: { value: CreatorStatus | null; label: string; count: number }[] = [
    { value: null, label: "All", count: total },
    ...STATUS_ORDER.map((value) => ({
      value,
      label: STATUS_META[value].label,
      count: counts[value] ?? 0,
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-foreground/60 text-xs">
        <strong className="text-foreground/80">Status</strong> = where you are with a creator (it
        updates itself when you message them or they repost).{" "}
        <strong className="text-foreground/80">Labels</strong> = your own groups, e.g. gym, top,
        spain — to filter and write to the right people. Select rows to change them.
      </p>
      <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => {
          const active = (status ?? null) === tab.value;
          return (
            <Link
              key={tab.label}
              href={hrefWith({ status: tab.value })}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
                active
                  ? "bg-foreground text-background"
                  : "hover:bg-foreground/5 text-foreground/70"
              }`}
            >
              {tab.label}{" "}
              <span className={active ? "opacity-70" : "text-foreground/40"}>{tab.count}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="flex min-w-48 flex-1 gap-2" role="search">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or @username"
            aria-label="Search creators"
            className={`${control} min-w-0 flex-1`}
          />
        </form>
        <Select
          aria-label="Filter by role"
          value={params.get("role") ?? ""}
          onChange={(event) => go({ role: event.target.value || null })}
          className="w-32"
        >
          <option value="">Any role</option>
          {ROLE_ORDER.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
        {tags.length > 0 && (
          <Select
            aria-label="Filter by label"
            value={params.get("tag") ?? ""}
            onChange={(event) => go({ tag: event.target.value || null })}
            className="w-36"
          >
            <option value="">All labels</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </Select>
        )}
        <Select
          aria-label="Sort"
          value={params.get("sort") ?? "followers"}
          onChange={(event) =>
            go({ sort: event.target.value === "followers" ? null : event.target.value })
          }
          className="w-40"
        >
          <option value="followers">Most followers</option>
          <option value="recent">Recently added</option>
          <option value="contact">Last contact</option>
        </Select>
      </div>
    </div>
  );
}
