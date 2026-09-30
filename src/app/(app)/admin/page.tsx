import { InviteForm } from "@/features/admin/invite-form";
import { MemberList } from "@/features/admin/member-list";
import { formatUsd } from "@/lib/format";
import { requireSuperadmin } from "@/server/auth/session";
import { listMembers, totalSpendMicros } from "@/server/services/admin";

export default async function AdminPage() {
  const { workspace } = await requireSuperadmin();
  const members = await listMembers();
  const people = members.filter((member) => member.status !== "revoked").length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-foreground/70 text-sm">
          {people} {people === 1 ? "person has" : "people have"} access · API spend this month, all
          users (estimate): <strong>{formatUsd(totalSpendMicros(members))}</strong>. The X Developer
          Console spend cap applies to all users together.
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Users</h2>
        <MemberList members={members} timeZone={workspace.timezone} />
      </section>
    </>
  );
}
