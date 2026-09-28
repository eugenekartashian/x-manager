"use client";

import { useActionState } from "react";
import { ActionMessage } from "./action-message";
import { refreshPostsAction, type ActionState } from "./actions";
import { SubmitButton } from "./submit-button";

const initial: ActionState = { status: "idle", message: "" };

export function RefreshPostsForm({ costLabel }: { costLabel: string }) {
  const [state, action] = useActionState(refreshPostsAction, initial);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <SubmitButton variant="secondary" pendingLabel="Loading from X…">
        Refresh from X <span className="text-foreground/60">(≤ {costLabel})</span>
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
