"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/features/auth/sign-out-button";

type Props = {
  items: readonly { href: string; label: string }[];
  email: string;
  /** Superadmin only: "Admin" lives in the account menu, not in the main nav. */
  isAdmin: boolean;
};

/** Main links + an account menu on wider screens; a burger menu at ≤ 768 px. */
export function AppNav({ items, email, isAdmin }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <nav aria-label="Main" className="flex min-w-0 items-center gap-x-5">
          <span className="font-semibold whitespace-nowrap">X Manager</span>
          <ul className="hidden items-center gap-x-4 min-[769px]:flex">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="text-foreground/70 hover:text-foreground aria-[current=page]:text-foreground text-sm whitespace-nowrap aria-[current=page]:font-medium"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden min-[769px]:block">
          <AccountMenu email={email} isAdmin={isAdmin} adminActive={isActive("/admin")} />
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
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
            {mobileOpen ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div id="mobile-menu" className="mt-3 flex flex-col gap-1 min-[769px]:hidden">
          <ul className="flex flex-col">
            {[...items, ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : [])].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
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

/** Round initial button → dropdown with the email, Admin (superadmin) and Sign out. */
function AccountMenu({
  email,
  isAdmin,
  adminActive,
}: {
  email: string;
  isAdmin: boolean;
  adminActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape (menu items close it on click).
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className={`hover:bg-foreground/5 flex items-center gap-1.5 rounded-full py-1 pr-2 pl-1 focus-visible:ring-2 focus-visible:outline-none ${adminActive ? "bg-foreground/5" : ""}`}
      >
        <span className="bg-foreground text-background flex size-7 items-center justify-center rounded-full text-sm font-semibold uppercase">
          {email.charAt(0)}
        </span>
        <svg
          viewBox="0 0 20 20"
          className="text-foreground/60 size-4"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="border-foreground/10 bg-background absolute right-0 z-20 mt-2 w-60 rounded-lg border p-1 shadow-lg"
        >
          <p className="text-foreground/60 truncate px-3 py-2 text-xs" title={email}>
            {email}
          </p>
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="hover:bg-foreground/5 block rounded-md px-3 py-2 text-sm"
            >
              Admin
            </Link>
          )}
          <div className="border-foreground/10 mt-1 border-t pt-1 [&_button]:w-full [&_button]:text-left">
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  );
}
