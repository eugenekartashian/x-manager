"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { loadPostsAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

type Props = { targetId: string; hasPosts: boolean; showCosts: boolean; note?: string | undefined };

export function LoadPostsForm({ targetId, hasPosts, showCosts, note }: Props) {
  const [state, action] = useActionState(loadPostsAction, initial);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="targetId" value={targetId} />
      <SubmitButton variant={hasPosts ? "secondary" : "primary"} pendingLabel="Loading from X…">
        {hasPosts ? "Reload latest posts" : "Load latest posts"}
        {showCosts && <span className="opacity-70"> (≈ $0.03)</span>}
      </SubmitButton>
      {note && <p className="text-foreground/60 text-xs">{note}</p>}
      <ActionMessage state={state} />
    </form>
  );
}
