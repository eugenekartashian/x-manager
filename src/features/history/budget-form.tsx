"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { saveBudgetAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

export function BudgetForm({ dollars }: { dollars: number }) {
  const [state, action] = useActionState(saveBudgetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Monthly budget (USD)
          <input
            type="number"
            name="dollars"
            min={1}
            max={500}
            step={0.5}
            required
            defaultValue={dollars}
            className="border-foreground/15 w-32 rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </label>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save budget
        </SubmitButton>
      </div>
      <p className="text-foreground/60 text-xs">
        When it is used up, Reposts and refreshes are skipped until the next month. Keep the Spend
        Cap in the X Developer Console at the same value.
      </p>
      <ActionMessage state={state} />
    </form>
  );
}
