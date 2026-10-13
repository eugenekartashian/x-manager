import Link from "next/link";
import { BudgetBanner } from "@/features/history/budget-banner";
import { AppNav } from "@/features/nav/app-nav";
import { requireWorkspace } from "@/server/auth/session";
import { budgetLevel, getBudgetStatus } from "@/server/services/budget";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/posts", label: "Posts" },
  { href: "/schedule", label: "Schedule" },
  { href: "/targets", label: "Creators" },
  { href: "/links", label: "Links" },
  { href: "/history", label: "History" },
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, role, workspace } = await requireWorkspace();
  const budget = await getBudgetStatus(workspace.id, new Date());

  return (
    <div className="flex flex-1 flex-col">
      <BudgetBanner level={budgetLevel(budget)} budget={budget} showCosts={role === "SUPERADMIN"} />
      <header className="border-foreground/10 border-b">
        <AppNav items={NAV} email={user.email} isAdmin={role === "SUPERADMIN"} />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
      <footer className="text-foreground/60 mx-auto w-full max-w-3xl px-4 pb-8 text-xs">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Terms of Use
        </Link>
        <span className="text-foreground/50 block pt-1">
          X Manager is an independent tool, not affiliated with or endorsed by X Corp.
        </span>
      </footer>
    </div>
  );
}
