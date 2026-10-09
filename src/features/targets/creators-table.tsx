"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import type { CreatorStatus, TargetAccount } from "@/generated/prisma/client";
import { Select } from "@/components/ui/select";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { formatCount, formatDateTime } from "@/lib/format";
import { bulkCreatorsAction } from "./actions";
import { ROLE_LABELS, ROLE_ORDER, STATUS_META, STATUS_ORDER } from "./creator-status";

type Props = {
  rows: TargetAccount[];
  timeZone: string;
  filtered: boolean;
  /** Superadmin with message permission: "Message" opens the bulk send page (D-035). */
  bulkMessage?: boolean;
  /** Superadmin: show the X cost in confirmations. */
  showCosts?: boolean;
};

const MAX_BULK = 10;

const initial: ActionState = { status: "idle", message: "" };
const control =
  "border-foreground/15 rounded-md border bg-transparent px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40";

/** Creators table (desktop) / cards (mobile) with selection and a floating action bar (M7.1). */
export function CreatorsTable({
  rows,
  timeZone,
  filtered,
  bulkMessage = false,
  showCosts = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(bulkCreatorsAction, initial);
  const [label, setLabel] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (rows.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-8 text-center text-sm">
        {filtered
          ? "No creators match these filters."
          : "No creators yet. Add accounts above, import a file or share them from X."}
      </p>
    );
  }

  const ids = [...selected];
  const allSelected = rows.every((row) => selected.has(row.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));

  function submit(
    op: "status" | "role" | "tag-add" | "remove" | "refresh",
    extra: Record<string, string> = {},
  ) {
    const formData = new FormData();
    formData.set("op", op);
    for (const [key, value] of Object.entries(extra)) formData.set(key, value);
    for (const id of ids) formData.append("id", id);
    action(formData);
    setConfirmRemove(false);
    if (op === "tag-add") setLabel("");
    if (op === "remove") setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-2">
      <ActionMessage state={state} />

      <div className="border-foreground/10 overflow-hidden rounded-lg border">
        <div className="text-foreground/50 bg-foreground/3 hidden grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_6.5rem] items-center gap-3 px-3 py-2 text-xs md:grid">
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
        </div>
        <ul className="divide-foreground/10 divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 md:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_6.5rem] ${
                selected.has(row.id) ? "bg-foreground/4" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
                aria-label={`Select @${row.username}`}
                className="size-4"
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
                  {/* Never truncated: long names wrap instead (user request). */}
                  <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium break-words">
                    {row.name}
                    {row.role && (
                      <span className="bg-foreground/10 rounded px-1.5 text-[11px] font-medium">
                        {ROLE_LABELS[row.role]}
                      </span>
                    )}
                  </span>
                  <span className="text-foreground/60 block text-xs break-all">
                    @{row.username}
                    <span className="md:hidden"> · {formatCount(row.followersCount)}</span>
                    {(row.followsYou || row.youFollow) && (
                      <span className="text-foreground/70 bg-foreground/10 ml-1.5 rounded px-1.5 text-[11px] whitespace-nowrap">
                        {row.followsYou ? (row.youFollow ? "Mutual" : "Follows you") : "You follow"}
                      </span>
                    )}
                  </span>
                  {(row.tags.length > 0 || row.lastContactAt) && (
                    <span className="text-foreground/50 mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                      {row.tags.map((item) => (
                        <span
                          key={item}
                          className="bg-foreground/5 text-foreground/70 rounded px-1.5"
                        >
                          {item}
                        </span>
                      ))}
                      {row.lastContactAt && (
                        <span>· contacted {formatDateTime(row.lastContactAt, timeZone)}</span>
                      )}
                    </span>
                  )}
                </span>
              </Link>
              <span className="hidden text-right text-sm tabular-nums md:block">
                {formatCount(row.followersCount)}
              </span>
              <StatusPill status={row.status} />
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
      {/* Space so the floating bar never covers the last rows. */}
      {ids.length > 0 && <div className="h-20" aria-hidden />}

      {/* Floating action bar (bottom, like Gmail): appears only with a selection, never
          covers the list. No bulk messaging by design (D-033). */}
      {ids.length > 0 && (
        <form
          ref={formRef}
          onSubmit={(event) => event.preventDefault()}
          className="border-foreground/10 bg-background fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border p-2.5 shadow-xl"
          aria-label="Actions for selected creators"
        >
          <span className="px-1 text-sm font-medium">{ids.length} selected</span>
          {bulkMessage &&
            (ids.length <= MAX_BULK ? (
              <Link
                href={`/targets/message?ids=${ids.join(",")}`}
                className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                Message
              </Link>
            ) : (
              <span className="text-foreground/50 text-xs">Message: up to {MAX_BULK}</span>
            ))}
          <Select
            aria-label="Move to status"
            value=""
            disabled={pending}
            onChange={(event) =>
              event.target.value && submit("status", { status: event.target.value })
            }
            className={control}
          >
            <option value="" disabled>
              Move to…
            </option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Set role"
            value=""
            disabled={pending}
            onChange={(event) =>
              event.target.value &&
              submit("role", { role: event.target.value === "none" ? "" : event.target.value })
            }
            className="w-28"
          >
            <option value="" disabled>
              Role…
            </option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
            <option value="none">No role</option>
          </Select>
          <span className="flex gap-1">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && label) submit("tag-add", { tag: label });
              }}
              placeholder="label, e.g. gym"
              aria-label="Label to add"
              className={`${control} w-36`}
            />
            <button
              type="button"
              disabled={!label || pending}
              onClick={() => submit("tag-add", { tag: label })}
              className={control}
            >
              + Label
            </button>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const cost = showCosts ? ` (≈ $${(ids.length * 0.01).toFixed(2)})` : "";
              if (window.confirm(`Update ${ids.length} profiles from X${cost}?`)) submit("refresh");
            }}
            title="Re-read followers, bio and who follows whom"
            className={control}
          >
            Refresh from X
          </button>
          {confirmRemove ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("remove")}
              className="rounded-md bg-red-600 px-2.5 py-1.5 text-sm font-medium text-white"
            >
              Remove {ids.length}?
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
            aria-label="Clear selection"
            className="text-foreground/60 hover:bg-foreground/5 ml-auto rounded-md px-2 py-1 text-sm"
          >
            ✕
          </button>
        </form>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: CreatorStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`justify-self-start rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}
