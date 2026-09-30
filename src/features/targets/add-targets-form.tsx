"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { addTargetsAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

export function AddTargetsForm({ showCosts }: { showCosts: boolean }) {
  const [state, action] = useActionState(addTargetsAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="handles" className="text-sm font-medium">
        Add accounts
      </label>
      <textarea
        id="handles"
        name="handles"
        rows={3}
        required
        placeholder={
          "@account1\n@account2\n…or paste a column of handles / profile links from Excel"
        }
        className="border-foreground/15 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" pendingLabel="Looking up on X…">
          Add
        </SubmitButton>
        <span className="text-foreground/60 text-xs">
          Up to 100 at a time{showCosts && " · ≈ $0.01 per new account (profile lookup)"}
        </span>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
