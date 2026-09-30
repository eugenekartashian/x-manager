import { InviteForm } from "@/features/admin/invite-form";
import { MemberList } from "@/features/admin/member-list";
import { formatUsd } from "@/lib/format";
import { requireSuperadmin } from "@/server/auth/session";
import { countDistinctTargets, listMembers, totalSpendMicros } from "@/server/services/admin";
import { globalBudgetMicros } from "@/server/services/budget";

export default async function AdminPage() {
  const { workspace } = await requireSuperadmin();
  const [members, targetCount] = await Promise.all([listMembers(), countDistinctTargets()]);
  const globalCap = globalBudgetMicros();
  const people = members.filter((member) => member.status !== "revoked").length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-foreground/70 text-sm">
          {people} {people === 1 ? "person has" : "people have"} access · API spend this month, all
          users (estimate): <strong>{formatUsd(totalSpendMicros(members))}</strong>
          {globalCap !== null && <> of {formatUsd(globalCap)} (app-wide cap)</>}. The X Developer
          Console spend cap applies to all users together.{" "}
          <a
            href="/api/admin/sentry-test"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Send a test error to Sentry
          </a>
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Invite</h2>
        <p className="text-foreground/70 text-sm">
          Only invited Google accounts can sign in. Each user gets their own workspace and connects
          their own X account.
        </p>
        <InviteForm />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Targets across users</h2>
        <p className="text-foreground/70 text-sm">
          {targetCount} public accounts added as targets. The export shows how many users added each
          one — not who.
        </p>
        {targetCount > 0 && (
          <a
            href="/api/admin/targets/export"
            className="border-foreground/15 hover:bg-foreground/5 self-start rounded-md border px-3 py-1.5 text-sm"
          >
            Export CSV
          </a>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Users</h2>
        <MemberList members={members} timeZone={workspace.timezone} />
      </section>
    </>
  );
}
