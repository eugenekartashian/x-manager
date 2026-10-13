"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        } catch {
          setCopied(false);
        }
      }}
      className="border-foreground/15 hover:bg-foreground/5 rounded-md border px-2.5 py-1 text-xs font-medium"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
