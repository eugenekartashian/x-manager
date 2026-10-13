"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/features/posts/submit-button";
import { createLinkAction, type CreateLinkState } from "./actions";
import { CopyButton } from "./copy-button";

const control =
  "border-foreground/15 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

export function CreateLinkForm({ lastDestination }: { lastDestination: string }) {
  const [state, action] = useActionState<CreateLinkState, FormData>(createLinkAction, {
    status: "idle",
  });
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Name
          <input
            name="label"
            required
            maxLength={80}
            placeholder="Bio · Post 13 Oct · Swap with @alex"
            className={control}
          />
        </label>
        <label className="flex flex-[2] flex-col gap-1 text-sm">
          Goes to
          <input
            name="destination"
            required
            defaultValue={lastDestination}
            placeholder="https://onlyfans.com/you"
            className={control}
          />
        </label>
        <SubmitButton variant="primary" pendingLabel="Creating…">
          Create link
        </SubmitButton>
      </form>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md bg-green-600/10 px-3 py-2 text-sm"
        >
          “{state.label}” is ready: <code className="break-all">{state.url}</code>
          <CopyButton value={state.url} />
        </p>
      )}
    </div>
  );
}
