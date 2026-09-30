"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { inviteAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

export function InviteForm() {
  const [state, action] = useActionState(inviteAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Google email
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="friend@gmail.com"
            className="border-foreground/15 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </label>
        <SubmitButton variant="primary" pendingLabel="Inviting…">
          Invite
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
