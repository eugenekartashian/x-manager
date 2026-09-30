import { DeleteAccountForm } from "@/features/account/delete-account-form";
import { XAccountCard } from "@/features/x-account/x-account-card";
import { requireWorkspace } from "@/server/auth/session";
import { findConnection } from "@/server/repositories/x-accounts";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { workspace, role } = await requireWorkspace();
  const [connection, query] = await Promise.all([findConnection(workspace.id), searchParams]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        <p className="text-foreground/70 text-sm">Timezone: {workspace.timezone}</p>
      </div>
      <XAccountCard
        connection={connection}
        status={typeof query.x === "string" ? query.x : undefined}
        error={typeof query.x_error === "string" ? query.x_error : undefined}
      />
      {role !== "SUPERADMIN" && (
        <section className="flex flex-col gap-3 rounded-lg border border-red-500/30 p-4">
          <h2 className="text-lg font-medium">Delete account</h2>
          <DeleteAccountForm />
        </section>
      )}
    </>
  );
}
