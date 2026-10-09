"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { CreatorStatus, TargetAccount } from "@/generated/prisma/client";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { formatCount, formatDateTime } from "@/lib/format";
import { bulkCreatorsAction } from "./actions";
import { STATUS_META, STATUS_ORDER } from "./creator-status";

type Props = { rows: TargetAccount[]; timeZone: string; filtered: boolean };

const initial: ActionState = { status: "idle", message: "" };
const control =
  "border-foreground/15 rounded-md border bg-transparent px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none";

/** Creators table (desktop) / cards (mobile) with row selection and bulk actions (M7.1). */
export function CreatorsTable({ rows, timeZone, filtered }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(bulkCreatorsAction, initial);
  const [tag, setTag] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (rows.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-8 text-center text-sm">
        {filtered
          ? "No creators match these filters."
          : "No creators yet. Add accounts above, import a file or share them from X."}
      </p>
    );
  }

  const allSelected = rows.every((row) => selected.has(row.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  const ids = [...selected];

  return (
    <div className="flex flex-col gap-2">
      {/* Bulk toolbar — appears only with a selection. No bulk messaging by design (D-033). */}
      {ids.length > 0 && (
        <form
          action={(formData) => {
            for (const id of ids) formData.append("id", id);
            action(formData);
            setConfirmRemove(false);
          }}
          className="bg-foreground/5 sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm"
        >
          <span className="px-1 font-medium">{ids.length} selected</span>
          <select
            name="status"
            aria-label="New status"
            defaultValue=""
            className={control}
            onChange={(event) => {
              if (!event.target.value) return;
              const form = event.target.form;
              const op = form?.elements.namedItem("op") as HTMLInputElement | null;
              if (op) op.value = "status";
              form?.requestSubmit();
            }}
          >
            <option value="" disabled>
              Set status…
            </option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </select>
          <input type="hidden" name="op" defaultValue="status" />
          <input
            name="tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="tag"
            aria-label="Tag"
            className={`${control} w-28`}
          />
          <button
            type="submit"
            disabled={!tag || pending}
            className={control}
            onClick={(event) => {
              const op = event.currentTarget.form?.elements.namedItem(
                "op",
              ) as HTMLInputElement | null;
              if (op) op.value = "tag-add";
            }}
          >
            + Tag
          </button>
          <button
            type="submit"
            disabled={!tag || pending}
            className={control}
            onClick={(event) => {
              const op = event.currentTarget.form?.elements.namedItem(
                "op",
              ) as HTMLInputElement | null;
              if (op) op.value = "tag-remove";
            }}
          >
            − Tag
          </button>
          {confirmRemove ? (
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-red-600 px-2 py-1 text-sm font-medium text-white"
              onClick={(event) => {
                const op = event.currentTarget.form?.elements.namedItem(
                  "op",
                ) as HTMLInputElement | null;
                if (op) op.value = "remove";
              }}
            >
              Confirm remove {ids.length}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className={`${control} text-red-700 dark:text-red-400`}
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-foreground/60 ml-auto px-2 text-sm"
          >
            Clear
          </button>
        </form>
      )}
      <ActionMessage state={state} />

      <div className="border-foreground/10 overflow-hidden rounded-lg border">
        <div className="text-foreground/50 bg-foreground/[0.03] hidden grid-cols-[2rem_minmax(0,1fr)_6rem_8rem_minmax(0,10rem)_7rem] items-center gap-3 px-3 py-2 text-xs md:grid">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all on this page"
            className="size-4"
          />
          <span>Creator</span>
          <span className="text-right">Followers</span>
          <span>Status</span>
          <span>Tags</span>
          <span>Last contact</span>
        </div>
        <ul className="divide-foreground/10 divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2.5 md:grid-cols-[2rem_minmax(0,1fr)_6rem_8rem_minmax(0,10rem)_7rem] ${
                selected.has(row.id) ? "bg-foreground/[0.04]" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
                aria-label={`Select @${row.username}`}
                className="size-4 self-start md:self-center"
              />
              <Link
                href={`/targets/${row.id}`}
                className="flex min-w-0 items-center gap-3 rounded-md hover:opacity-80"
              >
                <span className="bg-foreground/10 relative size-9 shrink-0 overflow-hidden rounded-full">
                  {row.avatarUrl && (
                    <Image
                      src={row.avatarUrl}
                      alt=""
                      fill
                      sizes="36px"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="text-foreground/60 block truncate text-xs">
                    @{row.username}
                    <span className="md:hidden">
                      {" "}
                      · {formatCount(row.followersCount)} followers
                    </span>
                  </span>
                  {row.note && (
                    <span className="text-foreground/50 block truncate text-xs">📝 {row.note}</span>
                  )}
                </span>
              </Link>
              <span className="hidden text-right text-sm tabular-nums md:block">
                {formatCount(row.followersCount)}
              </span>
              <span className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto">
                <StatusPill status={row.status} />
                <span className="flex flex-wrap gap-1 md:hidden">
                  {row.tags.map((item) => (
                    <span key={item} className="bg-foreground/5 rounded px-1.5 text-xs">
                      #{item}
                    </span>
                  ))}
                </span>
              </span>
              <span className="hidden flex-wrap gap-1 md:flex">
                {row.tags.map((item) => (
                  <span key={item} className="bg-foreground/5 rounded px-1.5 text-xs">
                    #{item}
                  </span>
                ))}
              </span>
              <span className="text-foreground/60 hidden text-xs md:block">
                {row.lastContactAt ? formatDateTime(row.lastContactAt, timeZone) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={toggleAll}
        className="text-foreground/60 self-start text-xs underline-offset-2 hover:underline md:hidden"
      >
        {allSelected ? "Unselect all" : "Select all on this page"}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: CreatorStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}
