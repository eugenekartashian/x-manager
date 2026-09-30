"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { ActionMessage } from "@/features/posts/action-message";
import type { ActionState } from "@/features/posts/actions";
import { SubmitButton } from "@/features/posts/submit-button";
import { LIMIT_BOUNDS, type NumericLimit, type UserLimits } from "@/server/domain/user-limits";
import { saveLimitsAction } from "./actions";

const initial: ActionState = { status: "idle", message: "" };

const FIELDS: { name: NumericLimit; label: string }[] = [
  { name: "listPosts", label: "Posts in repost list" },
  { name: "dailyTimes", label: "Repost times per day" },
  { name: "targets", label: "Target accounts" },
  { name: "targetLoadsPerDay", label: "Target post loads per day" },
  { name: "aiIdeasPerTargetPerDay", label: "AI ideas per target per day" },
];

type Props = { email: string; limits: UserLimits; budgetDollars: number };

/** Summary line + "Edit limits" panel for one user (superadmin only). */
export function LimitsForm({ email, limits, budgetDollars }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveLimitsAction, initial);

  // onSubmit instead of `action`: React would reset the checkboxes after an `action` submit.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  const summary = [
    `${limits.listPosts} posts`,
    `${limits.dailyTimes} times/day`,
    limits.targetsEnabled
      ? `${limits.targets} targets · ${limits.targetLoadsPerDay} loads/day`
      : "Targets off",
    limits.aiEnabled ? `${limits.aiIdeasPerTargetPerDay} AI/target/day` : "AI off",
    `$${budgetDollars}/month`,
  ].join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-foreground/70 text-xs">
          <span className="text-foreground/50">Limits:</span> {summary}
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="hover:bg-foreground/5 rounded-md px-2 py-1 text-sm font-medium"
        >
          {open ? "Close" : "Edit limits"}
        </button>
      </div>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="bg-foreground/5 flex flex-col gap-3 rounded-md p-3"
        >
          <input type="hidden" name="email" value={email} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.name} className="flex flex-col gap-1 text-sm">
                {field.label}
                <input
                  type="number"
                  name={field.name}
                  required
                  min={LIMIT_BOUNDS[field.name].min}
                  max={LIMIT_BOUNDS[field.name].max}
                  step={1}
                  defaultValue={limits[field.name]}
                  className="border-foreground/15 bg-background rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                />
                <span className="text-foreground/50 text-xs">
                  {LIMIT_BOUNDS[field.name].min}–{LIMIT_BOUNDS[field.name].max}
                </span>
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm">
              Monthly budget (USD)
              <input
                type="number"
                name="budgetDollars"
                required
                min={1}
                max={500}
                step={0.5}
                defaultValue={budgetDollars}
                className="border-foreground/15 bg-background rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
              <span className="text-foreground/50 text-xs">
                Hard stop for this user&apos;s API use
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="targetsEnabled"
                defaultChecked={limits.targetsEnabled}
                className="size-4 accent-green-600"
              />
              Targets & replies
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="aiEnabled"
                defaultChecked={limits.aiEnabled}
                className="size-4 accent-green-600"
              />
              AI ideas
            </label>
          </div>
          <div className="flex justify-end">
            <SubmitButton variant="primary" pendingLabel="Saving…">
              Save limits
            </SubmitButton>
          </div>
        </form>
      )}
      <ActionMessage state={state} />
    </div>
  );
}
