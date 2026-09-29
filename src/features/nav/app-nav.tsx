"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/features/auth/sign-out-button";

type Props = { items: readonly { href: string; label: string }[]; email: string };

/** Inline links on wider screens; a burger menu on phones. */
export function AppNav({ items, email }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <nav aria-label="Main" className="flex items-center gap-x-4">
          <span className="font-semibold">X Manager</span>
          <ul className="hidden items-center gap-x-4 min-[769px]:flex">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="text-foreground/70 hover:text-foreground aria-[current=page]:text-foreground text-sm aria-[current=page]:font-medium"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden min-w-0 items-center gap-3 min-[769px]:flex">
          <span className="text-foreground/70 truncate text-sm">{email}</span>
          <SignOutButton />
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="hover:bg-foreground/5 -mr-2 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none min-[769px]:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="mt-3 flex flex-col gap-1 min-[769px]:hidden">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="hover:bg-foreground/5 aria-[current=page]:bg-foreground/5 block rounded-md px-2 py-2.5 aria-[current=page]:font-medium"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-foreground/10 mt-2 flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-foreground/70 truncate text-sm">{email}</span>
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  );
}
