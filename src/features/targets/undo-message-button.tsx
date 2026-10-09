"use client";

import { useTransition } from "react";
import { undoMessageAction } from "./outreach-actions";

/** "Didn't send it?" on a recent message in History (24 h). */
export function UndoMessageButton({ eventId, targetId }: { eventId: string; targetId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => void (await undoMessageAction({ eventId, targetId })))
      }
      className="text-foreground/50 hover:text-foreground ml-2 text-xs underline"
      title="Not sent, or deleted in X? Remove it from history and free the daily slot."
    >
      {pending ? "…" : "undo"}
    </button>
  );
}
