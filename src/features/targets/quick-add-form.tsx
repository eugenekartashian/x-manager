"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { addSharedTargetAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

export function QuickAddForm({ handle }: { handle: string }) {
  const [state, action] = useActionState(addSharedTargetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="handle" value={handle} />
      <SubmitButton variant="primary" pendingLabel="Adding…">
        Add @{handle} to targets
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
