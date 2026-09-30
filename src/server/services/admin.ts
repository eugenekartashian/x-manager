import "server-only";
import type { UserRole, XAccountStatus } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/allowlist";
import type { UserLimits } from "@/server/domain/user-limits";
import * as admin from "@/server/repositories/admin";
import { isSuperadminEmail } from "@/server/services/access";
import { csvCell } from "@/server/services/targets";

// Admin overview (M6.2): everyone with access or an invite, merged by email.

export type MemberStatus =
  | "superadmin" // from SUPERADMIN_EMAILS
  | "active" // invited and signed in
  | "invited" // invite not used yet
  | "revoked" // invite revoked
  | "no_access"; // account without an active invite (e.g. invite deleted)

export type Member = {
  email: string;
  name: string | null;
  role: UserRole | null;
  status: MemberStatus;
  xUsername: string | null;
  xStatus: XAccountStatus | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  lastSeenAt: Date | null;
  spentMicros: bigint;
  budgetMicros: bigint | null;
  /** Editable limits; null for the superadmin and for invites not used yet. */
  limits: UserLimits | null;
};

const STATUS_ORDER: MemberStatus[] = ["superadmin", "active", "invited", "no_access", "revoked"];

export async function listMembers(now: Date = new Date()): Promise<Member[]> {
  const [users, invites, spend] = await Promise.all([
    admin.listUsersWithWorkspace(),
    admin.listAllInvites(),
    admin.monthSpendByWorkspace(now),
  ]);
  const invitesByEmail = new Map(invites.map((invite) => [invite.email, invite]));
  const members: Member[] = [];

  for (const user of users) {
    const email = normalizeEmail(user.email);
    const invite = invitesByEmail.get(email);
    invitesByEmail.delete(email);
    members.push({
      email,
      name: user.name,
      role: user.role,
      status: isSuperadminEmail(email)
        ? "superadmin"
        : !invite
          ? "no_access"
          : invite.revokedAt
            ? "revoked"
            : "active",
      xUsername: user.workspace?.xAccount?.username ?? null,
      xStatus: user.workspace?.xAccount?.status ?? null,
      invitedAt: invite?.createdAt ?? null,
      joinedAt: user.createdAt,
      lastSeenAt: user.sessions[0]?.updatedAt ?? null,
      spentMicros: (user.workspace && spend.get(user.workspace.id)) ?? 0n,
      budgetMicros: user.workspace?.monthlyBudgetMicros ?? null,
      limits:
        user.workspace && !isSuperadminEmail(email)
          ? {
              listPosts: user.workspace.limitListPosts,
              dailyTimes: user.workspace.limitDailyTimes,
              targets: user.workspace.limitTargets,
              targetLoadsPerDay: user.workspace.limitTargetLoadsPerDay,
              aiIdeasPerTargetPerDay: user.workspace.limitAiIdeasPerTargetDay,
              targetsEnabled: user.workspace.targetsEnabled,
              aiEnabled: user.workspace.aiEnabled,
            }
          : null,
    });
  }

  for (const invite of invitesByEmail.values()) {
    members.push({
      email: invite.email,
      name: null,
      role: null,
      status: invite.revokedAt ? "revoked" : "invited",
      xUsername: null,
      xStatus: null,
      invitedAt: invite.createdAt,
      joinedAt: null,
      lastSeenAt: null,
      spentMicros: 0n,
      budgetMicros: null,
      limits: null,
    });
  }

  return members.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.email.localeCompare(b.email),
  );
}

export function totalSpendMicros(members: Member[]): bigint {
  return members.reduce((sum, member) => sum + member.spentMicros, 0n);
}

/** CSV of popular targets across all users (superadmin only; no user identities). */
export async function exportTargetPopularityCsv(): Promise<string> {
  const rows = await admin.targetPopularity();
  const lines = [
    "username,name,followers,added_by_users,profile_url",
    ...rows.map((row) =>
      [
        `@${row.username}`,
        row.name,
        row.followers === null ? "" : String(row.followers),
        String(row.users),
        `https://x.com/${row.username}`,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return lines.join("\r\n");
}

export function countDistinctTargets(): Promise<number> {
  return admin.targetPopularity().then((rows) => rows.length);
}
