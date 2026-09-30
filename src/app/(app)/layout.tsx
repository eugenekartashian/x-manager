import { BudgetBanner } from "@/features/history/budget-banner";
import { AppNav } from "@/features/nav/app-nav";
import { requireWorkspace } from "@/server/auth/session";
import { budgetLevel, getBudgetStatus } from "@/server/services/budget";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/posts", label: "Posts" },
  { href: "/schedule", label: "Schedule" },
  { href: "/targets", label: "Targets" },
  { href: "/history", label: "History" },
] as const;

const ADMIN_NAV = { href: "/admin", label: "Admin" } as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, role, workspace } = await requireWorkspace();
  const budget = await getBudgetStatus(workspace.id, new Date());

  return (
    <div className="flex flex-1 flex-col">
      <BudgetBanner level={budgetLevel(budget)} budget={budget} showCosts={role === "SUPERADMIN"} />
      <header className="border-foreground/10 border-b">
        <AppNav items={role === "SUPERADMIN" ? [...NAV, ADMIN_NAV] : NAV} email={user.email} />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
