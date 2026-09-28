"use client";

import { useActionState } from "react";
import { ActionMessage } from "./action-message";
import { addPostByUrlAction, type ActionState } from "./actions";
import { SubmitButton } from "./submit-button";

const initial: ActionState = { status: "idle", message: "" };

export function AddPostForm() {
  const [state, action] = useActionState(addPostByUrlAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="post-url" className="text-sm font-medium">
        Add one of your posts by link
      </label>
      <div className="flex gap-2">
        <input
          id="post-url"
          name="url"
          type="text"
          inputMode="url"
          required
          maxLength={500}
          placeholder="https://x.com/you/status/…"
          className="border-foreground/15 min-w-0 flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <SubmitButton variant="primary" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
