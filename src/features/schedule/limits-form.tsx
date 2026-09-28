"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { saveLimitsAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };
const field =
  "rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none";

type Props = {
  intervalHours: number;
  dailyCap: number;
  intervalOptions: readonly number[];
  maxCap: number;
};

export function LimitsForm({ intervalHours, dailyCap, intervalOptions, maxCap }: Props) {
  const [state, action] = useActionState(saveLimitsAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Same post at most every
          <select name="minIntervalHours" defaultValue={intervalHours} className={field}>
            {intervalOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours} hours
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max Reposts per day
          <select name="dailyCap" defaultValue={dailyCap} className={field}>
            {Array.from({ length: maxCap }, (_, index) => index + 1).map((cap) => (
              <option key={cap} value={cap}>
                {cap}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save limits
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
