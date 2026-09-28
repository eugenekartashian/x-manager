"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { Select } from "@/components/ui/select";
import { addSlotAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };
const field =
  "rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none";

type Option = { value: string; label: string };
type Props = {
  timezones: readonly Option[];
  defaultTimezone: string;
  posts: Option[];
  disabled: boolean;
};

export function AddSlotForm({ timezones, defaultTimezone, posts, disabled }: Props) {
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
            className={field}
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Timezone
          <Select
            name="timezone"
            defaultValue={defaultTimezone}
            className="min-w-40"
            disabled={disabled}
          >
            {timezones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          What to repost
          <Select
            name="target"
            defaultValue="NEXT_FROM_LIST"
            className="min-w-40"
            disabled={disabled}
          >
            <option value="NEXT_FROM_LIST">Next from repost list</option>
            <option value="PINNED">📌 Pinned post</option>
            {posts.length > 0 && (
              <optgroup label="A specific post">
                {posts.map((post) => (
                  <option key={post.value} value={`POST:${post.value}`}>
                    {post.label}
                  </option>
                ))}
              </optgroup>
            )}
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
