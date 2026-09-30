"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { deleteAccountAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-foreground/70 text-sm">
        Permanently deletes your X Manager account and all its data: the X connection (access is
        also revoked at X), your repost list and schedule, history, targets, templates and replies.
        This can&apos;t be undone. Your posts on X are not touched.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Type DELETE to confirm
          <input
            name="confirm"
            required
            autoComplete="off"
            pattern="DELETE"
            className="border-foreground/15 w-40 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </label>
        <SubmitButton variant="secondary" pendingLabel="Deleting…">
          Delete my account
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
