"use client";

import { useActionState, useState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { saveScheduleAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };
const input =
  "rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50";

type Props = { active: boolean; startDate: string; durationDays: number | null };

export function ScheduleForm({ active, startDate, durationDays }: Props) {
  const [state, action] = useActionState(saveScheduleAction, initial);
  const [noEnd, setNoEnd] = useState(durationDays === null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={active}
          className="size-5 accent-green-600"
        />
        <span className="font-medium">Schedule is ON</span>
        <span className="text-foreground/60 text-sm">(when off, nothing is reposted)</span>
      </label>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Start date
          <input type="date" name="startDate" required defaultValue={startDate} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Duration (days)
          <input
            type="number"
            name="durationDays"
            min={1}
            max={366}
            defaultValue={durationDays ?? 30}
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

      <div className="flex items-center gap-3">
        <SubmitButton variant="primary" pendingLabel="Saving…">
          Save schedule
        </SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
