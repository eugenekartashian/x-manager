"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { Select } from "@/components/ui/select";
import { saveLimitsAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

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
          <Select name="minIntervalHours" defaultValue={intervalHours} className="min-w-40">
            {intervalOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours} hours
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max Reposts per day
          <Select name="dailyCap" defaultValue={dailyCap} className="min-w-40">
            {Array.from({ length: maxCap }, (_, index) => index + 1).map((cap) => (
              <option key={cap} value={cap}>
                {cap}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save limits
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
