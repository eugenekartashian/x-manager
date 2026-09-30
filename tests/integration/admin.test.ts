import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { inviteUser, revokeAccess } from "@/server/services/access";
import { listMembers, totalSpendMicros } from "@/server/services/admin";
import { connectXDirectly, createOwner, createUser, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// SUPERADMIN_EMAILS in tests: owner-a@example.com (D-025).
const NOW = new Date("2026-10-15T12:00:00Z");

async function usage(workspaceId: string, costMicros: bigint, occurredAt: Date) {
  await prisma.externalUsage.create({
    data: { workspaceId, provider: "X", operation: "repost", units: 1, costMicros, occurredAt },
  });
}

describe("listMembers", () => {
  it("merges users and invites with status, X account and month spend", async () => {
    const owner = await createOwner("a");
    const friend = await createOwner("b"); // owner-b@example.com
    await inviteUser(owner.userId, "owner-b@example.com");
    await inviteUser(owner.userId, "pending@example.com");
    await inviteUser(owner.userId, "gone@example.com");
    await revokeAccess("gone@example.com", NOW);
    await createUser("user-x", "stranger@example.com");
    await connectXDirectly(friend.workspaceId, { xUserId: "friend_x", accessToken: "t" });
    await usage(friend.workspaceId, 25_000n, new Date("2026-10-02T10:00:00Z"));
    await usage(friend.workspaceId, 15_000n, new Date("2026-10-15T09:00:00Z"));
    await usage(friend.workspaceId, 99_000n, new Date("2026-09-30T23:59:00Z")); // last month
    await usage(owner.workspaceId, 5_000n, new Date("2026-10-01T00:00:00Z"));

    const members = await listMembers(NOW);

    expect(members.map((member) => [member.email, member.status])).toEqual([
      ["owner-a@example.com", "superadmin"],
      ["owner-b@example.com", "active"],
      ["pending@example.com", "invited"],
      ["stranger@example.com", "no_access"],
      ["gone@example.com", "revoked"],
    ]);
    const friendRow = members.find((member) => member.email === "owner-b@example.com");
    expect(friendRow).toMatchObject({
      xUsername: "friend_x",
      xStatus: "CONNECTED",
      spentMicros: 40_000n,
      budgetMicros: 10_000_000n,
    });
    expect(members.find((member) => member.status === "invited")).toMatchObject({
      joinedAt: null,
      spentMicros: 0n,
      budgetMicros: null,
    });
    expect(totalSpendMicros(members)).toBe(45_000n);
  });

  it("returns an empty list when nobody exists", async () => {
    expect(await listMembers(NOW)).toEqual([]);
  });
});

describe("target popularity export (D-031)", () => {
  it("aggregates targets across users by X account without revealing who added them", async () => {
    const { exportTargetPopularityCsv } = await import("@/server/services/admin");
    const a = await createOwner("a");
    const b = await createOwner("b");
    const add = (workspaceId: string, xUserId: string, username: string, followers: number) =>
      prisma.targetAccount.create({
        data: {
          workspaceId,
          xUserId,
          username,
          name: username,
          followersCount: followers,
          lookedUpAt: NOW,
          note: "private note",
        },
      });
    await add(a.workspaceId, "1", "alex", 100);
    await add(b.workspaceId, "1", "alex", 120);
    await add(b.workspaceId, "2", "gio", 900);

    const [header, first, second] = (await exportTargetPopularityCsv()).split("\r\n");

    expect(header).toBe("username,name,followers,added_by_users,profile_url");
    expect(first).toBe('"@alex","alex","120","2","https://x.com/alex"');
    expect(second).toBe('"@gio","gio","900","1","https://x.com/gio"');
    const csv = [header, first, second].join("\n");
    expect(csv).not.toMatch(/owner-|example\.com|private note/);
  });
});
