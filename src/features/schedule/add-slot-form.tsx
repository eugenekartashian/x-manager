"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { Select } from "@/components/ui/select";
import { addSlotAction } from "./actions";
import { REPOST_LIST_NAME } from "./list-badge";

const initial: ActionState = { status: "idle", message: "" };

type Option = { value: string; label: string };
type Props = {
  timezones: readonly Option[];
  defaultTimezone: string;
  disabled: boolean;
  listSize: number;
};

export function AddSlotForm({ timezones, defaultTimezone, disabled, listSize }: Props) {
  const [state, action] = useActionState(addSlotAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Time
          <input
            type="time"
            name="localTime"
            required
            defaultValue="09:00"
            disabled={disabled}
            className="border-foreground/15 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Timezone
          <Select
            name="timezone"
            defaultValue={defaultTimezone}
            disabled={disabled}
            className="min-w-56"
          >
            {timezones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Repost from
          {/* One list for now; more lists with their own schedules come later (ROADMAP). */}
          <Select name="list" defaultValue="main" disabled={disabled} className="min-w-48">
            <option value="main">
              {REPOST_LIST_NAME} ({listSize} posts)
            </option>
          </Select>
        </label>
        <SubmitButton variant="primary" pendingLabel="Adding…">
          Add time
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
