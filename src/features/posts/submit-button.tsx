"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  ariaLabel?: string;
};

const VARIANTS = {
  primary: "bg-foreground text-background hover:opacity-90 px-3 py-1.5",
  secondary: "border border-foreground/15 hover:bg-foreground/5 px-3 py-1.5",
  ghost: "text-foreground/70 hover:bg-foreground/5 hover:text-foreground px-2 py-1",
};

/** Submit button that disables itself while its form is pending (no double submits). */
export function SubmitButton({ children, pendingLabel, variant = "secondary", ariaLabel }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      className={`rounded-md text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 ${VARIANTS[variant]}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
