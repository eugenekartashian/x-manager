"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/select";

type Props = {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  hidden: Record<string, string>;
  action: (formData: FormData) => Promise<void>;
};

/** A select that saves as soon as it changes (no separate Save button) and says so. */
export function AutoSaveSelect({ label, name, defaultValue, options, hidden, action }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    setValue(next);
    setSaved(false);
    const formData = new FormData();
    formData.set(name, next);
    for (const [key, hiddenValue] of Object.entries(hidden)) formData.set(key, hiddenValue);
    startTransition(async () => {
      await action(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2_000);
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-foreground/60 text-xs">{label}</span>
      <Select
        value={value}
        onChange={(event) => change(event.target.value)}
        disabled={pending}
        aria-label={label}
        className="w-36"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <span className="w-14 text-xs text-green-700 dark:text-green-400" aria-live="polite">
        {pending ? "Saving…" : saved ? "Saved ✓" : ""}
      </span>
    </label>
  );
}
