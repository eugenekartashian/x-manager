"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/select";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { saveReplyLimitsAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

type Props = {
  cooldownHours: number;
  perDay: number;
  cooldownOptions: readonly number[];
  dailyOptions: readonly number[];
};

export function ReplyLimitsForm({ cooldownHours, perDay, cooldownOptions, dailyOptions }: Props) {
  const [state, action] = useActionState(saveReplyLimitsAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Same account at most every
          <Select name="cooldownHours" defaultValue={cooldownHours} className="min-w-36">
            {cooldownOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours} hours
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Replies per day
          <Select name="perDay" defaultValue={perDay} className="min-w-28">
            {dailyOptions.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save limits
        </SubmitButton>
      </div>
      <p className="text-foreground/60 text-xs">
        X publishes no exact numbers; lots of unsolicited replies look like spam and get reported.
        Defaults (24 h, 15/day) are a cautious starting point.
      </p>
      <ActionMessage state={state} />
    </form>
  );
}
