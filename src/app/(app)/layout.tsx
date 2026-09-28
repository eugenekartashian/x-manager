import { SignOutButton } from "@/features/auth/sign-out-button";
import { requireWorkspace } from "@/server/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireWorkspace();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-foreground/10 border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold">X Manager</span>
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
