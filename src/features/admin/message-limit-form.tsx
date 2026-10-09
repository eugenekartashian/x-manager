"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/select";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { saveMessageLimitAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

type Props = { perDay: number; options: readonly number[] };

/** Superadmin's own daily message limit (manual + X API sends). */
export function MessageLimitForm({ perDay, options }: Props) {
  const [state, action] = useActionState(saveMessageLimitAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Messages per day
          <Select name="perDay" defaultValue={perDay} className="min-w-28">
            {options.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
