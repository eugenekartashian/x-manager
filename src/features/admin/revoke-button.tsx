"use client";

import { useActionState, useState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { revokeAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

/** Two-step: "Revoke access" → "Confirm" (signs the user out and pauses their Reposts). */
export function RevokeButton({ email }: { email: string }) {
  const [state, action] = useActionState(revokeAction, initial);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-foreground/70 hover:bg-foreground/5 hover:text-foreground rounded-md px-2 py-1 text-sm font-medium"
        >
          Revoke access
        </button>
        <ActionMessage state={state} />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="email" value={email} />
      <span className="text-xs text-red-700 dark:text-red-400">
        Sign out and pause their Reposts?
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="hover:bg-foreground/5 rounded-md px-2 py-1 text-sm"
      >
        Cancel
      </button>
      <SubmitButton variant="primary" pendingLabel="Revoking…">
        Confirm
      </SubmitButton>
    </form>
  );
}
