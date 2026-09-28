import { requireWorkspace } from "@/server/auth/session";

export default async function DashboardPage() {
  const { workspace } = await requireWorkspace();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        <p className="text-foreground/70 text-sm">Timezone: {workspace.timezone}</p>
      </div>
      <section className="border-foreground/10 rounded-lg border p-4">
        <h2 className="font-medium">X account</h2>
        <p className="text-foreground/70 mt-1 text-sm">
          Not connected yet. Connecting your X account comes in the next step.
        </p>
      </section>
    </>
  );
}
