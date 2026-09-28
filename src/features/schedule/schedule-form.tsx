"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { addDays, isLocalDate, zonedToUtc } from "@/lib/zoned-time";
import { saveScheduleAction } from "./actions";
import { formatDay } from "./labels";

const initial: ActionState = { status: "idle", message: "" };
const input =
  "rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50";

type Props = { active: boolean; startDate: string; durationDays: number | null; timeZone: string };

export function ScheduleForm(saved: Props) {
  const [state, action, pending] = useActionState(saveScheduleAction, initial);
  const [active, setActive] = useState(saved.active);
  const [startDate, setStartDate] = useState(saved.startDate);
  const [noEnd, setNoEnd] = useState(saved.durationDays === null);
  const [duration, setDuration] = useState(String(saved.durationDays ?? 30));

  const days = Number(duration);
  const validDays = Number.isInteger(days) && days >= 1 && days <= 366;
  const dirty =
    active !== saved.active ||
    startDate !== saved.startDate ||
    (noEnd ? null : days) !== saved.durationDays;

  // Live summary of what the form says (not what is saved).
  const day = (date: string) =>
    formatDay(zonedToUtc(date, "12:00", saved.timeZone), saved.timeZone);
  let summary = "Pick a valid start date.";
  if (isLocalDate(startDate)) {
    summary = noEnd
      ? `From ${day(startDate)}, with no end date.`
      : validDays
        ? `From ${day(startDate)} to ${day(addDays(startDate, days - 1))} inclusive (${days} day${days === 1 ? "" : "s"}).`
        : "Duration must be 1–366 days.";
  }

  // Submit via onSubmit, not the `action` prop: React resets forms after an `action`
  // submit, which would flip these controlled checkboxes back to their initial DOM state.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="active"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="size-5 accent-green-600"
        />
        <span className="font-medium">Schedule is {active ? "ON" : "OFF"}</span>
        <span className="text-foreground/60 text-sm">(when off, nothing is reposted)</span>
      </label>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Start date
          <input
            type="date"
            name="startDate"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Duration (days)
          <input
            type="number"
            name="durationDays"
            min={1}
            max={366}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            disabled={noEnd}
            className={`${input} w-28`}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="noEnd"
            checked={noEnd}
            onChange={(event) => setNoEnd(event.target.checked)}
          />
          No end date
        </label>
      </div>

      <p className="text-foreground/70 text-sm">
        {active ? "Reposts run " : "Off. When on, it would run "}
        {summary.charAt(0).toLowerCase() + summary.slice(1)}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" pendingLabel="Saving…" pending={pending}>
          Save schedule
        </SubmitButton>
        {dirty ? (
          <span role="status" className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Not saved yet — click “Save schedule”.
          </span>
        ) : (
          <ActionMessage state={state} />
        )}
      </div>
    </form>
  );
}
