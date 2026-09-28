import Link from "next/link";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { BudgetBanner } from "@/features/history/budget-banner";
import { requireWorkspace } from "@/server/auth/session";
import { budgetLevel, getBudgetStatus } from "@/server/services/budget";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/posts", label: "Posts" },
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, workspace } = await requireWorkspace();
  const budget = await getBudgetStatus(workspace.id, new Date());

  return (
    <div className="flex flex-1 flex-col">
      <BudgetBanner level={budgetLevel(budget)} budget={budget} />
      <header className="border-foreground/10 border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">X Manager</span>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-foreground/70 hover:text-foreground text-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-foreground/70 truncate text-sm">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
