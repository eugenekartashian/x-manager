import Link from "next/link";
import { redirect } from "next/navigation";
import { QuickAddForm } from "@/features/targets/quick-add-form";
import { TargetsDisabled } from "@/features/targets/targets-disabled";
import { handleFromShared } from "@/lib/handles";
import { requireWorkspace } from "@/server/auth/session";
import { getLimits } from "@/server/services/limits";
import { findTargetId } from "@/server/services/targets";

// Landing page for "Share → X Manager" (Android share target), the iPhone Shortcut and the
// desktop bookmarklet (M3.5). Only the shared link/text arrives — nothing is read from X here.
export default async function QuickAddPage({ searchParams }: PageProps<"/targets/add">) {
  const { workspace } = await requireWorkspace();
  const limits = await getLimits(workspace.id);
  if (limits && !limits.targetsEnabled) return <TargetsDisabled />;

  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? query[key] : undefined);
  const handle = handleFromShared(value("url"), value("text"), value("title"));

  if (handle) {
    const existing = await findTargetId(workspace.id, handle);
    if (existing) redirect(`/targets/${existing}`);
  }

  return (
    <>
      <Link href="/targets" className="text-foreground/70 hover:text-foreground text-sm">
        ← Targets
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Add a target</h1>
      {handle ? (
        <section className="border-foreground/10 flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">
            From the shared link: <strong>@{handle}</strong>{" "}
            <a
              href={`https://x.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 underline-offset-2 hover:underline"
            >
              open on X ↗
            </a>
          </p>
          <QuickAddForm handle={handle} />
        </section>
      ) : (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          No @username found in what was shared. Share the account&apos;s profile (or one of its
          posts) from X, or add it by @handle on the{" "}
          <Link href="/targets" className="underline">
            Targets
          </Link>{" "}
          page.
        </p>
      )}
    </>
  );
}
