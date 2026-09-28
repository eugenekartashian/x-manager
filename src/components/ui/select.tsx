import type { ComponentProps } from "react";

/** Native select with a consistent chevron and padding (the OS arrow sits unevenly). */
export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        {...props}
        className="border-foreground/15 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border bg-transparent py-1.5 pr-9 pl-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="text-foreground/60 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      >
        <path
          fillRule="evenodd"
          d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}
