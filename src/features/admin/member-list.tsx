import { formatDateTime, formatUsd } from "@/lib/format";
import type { Member, MemberStatus } from "@/server/services/admin";
import { RevokeButton } from "./revoke-button";

const STATUS: Record<MemberStatus, { label: string; tone: string }> = {
  superadmin: { label: "Superadmin", tone: "bg-foreground text-background" },
  active: { label: "Active", tone: "bg-green-600/10 text-green-700 dark:text-green-400" },
  invited: { label: "Invited · not signed in yet", tone: "bg-foreground/10" },
  revoked: { label: "Revoked", tone: "bg-red-600/10 text-red-700 dark:text-red-400" },
  no_access: { label: "No access", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

type Props = { members: Member[]; timeZone: string };

export function MemberList({ members, timeZone }: Props) {
  if (members.length === 0) {
    return (
      <p className="border-foreground/15 text-foreground/60 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        No users yet. Invite someone above.
      </p>
    );
  }

  return (
    <ul className="divide-foreground/10 border-foreground/10 flex flex-col divide-y rounded-lg border">
      {members.map((member) => {
        const status = STATUS[member.status];
        const canRevoke = member.status === "active" || member.status === "invited";
        return (
          <li key={member.email} className="flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-medium">{member.email}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${status.tone}`}>
                {status.label}
              </span>
            </div>
            <dl className="text-foreground/70 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <Row label="X account">
                {member.xUsername ? (
                  <>
                    @{member.xUsername}
                    {member.xStatus !== "CONNECTED" && (
                      <span className="text-amber-700 dark:text-amber-400"> · needs reconnect</span>
                    )}
                  </>
                ) : (
                  "not connected"
                )}
              </Row>
              <Row label="Spend this month">
                {formatUsd(member.spentMicros)}
                {member.budgetMicros !== null && ` of ${formatUsd(member.budgetMicros)}`}
              </Row>
              <Row label="Joined">
                {member.joinedAt ? formatDateTime(member.joinedAt, timeZone) : "—"}
              </Row>
              <Row label="Last active">
                {member.lastSeenAt ? formatDateTime(member.lastSeenAt, timeZone) : "—"}
              </Row>
            </dl>
            {canRevoke && (
              <div className="flex justify-end">
                <RevokeButton email={member.email} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt className="text-foreground/50">{label}:</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
