import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hasAppAccess, inviteUser, resolveAccess, revokeAccess } from "@/server/services/access";
import { createOwner, createUser, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// SUPERADMIN_EMAILS in tests: owner-a@example.com (D-025).
const NOW = new Date("2026-10-01T12:00:00Z");

describe("invites", () => {
  it("normalizes the email and grants access", async () => {
    const { userId } = await createOwner("a");

    const result = await inviteUser(userId, "  Friend@Example.COM ");

    expect(result).toEqual({ ok: true, data: { email: "friend@example.com" } });
    expect(await hasAppAccess("friend@example.com")).toBe(true);
    const invite = await prisma.accessInvite.findUniqueOrThrow({
      where: { email: "friend@example.com" },
    });
    expect(invite.invitedById).toBe(userId);
  });

  it("rejects invalid emails and the superadmin's own email", async () => {
    const { userId } = await createOwner("a");

    expect(await inviteUser(userId, "not-an-email")).toEqual({ ok: false, error: "invalid_email" });
    expect(await inviteUser(userId, "OWNER-A@example.com")).toEqual({
      ok: false,
      error: "already_superadmin",
    });
    expect(await prisma.accessInvite.count()).toBe(0);
  });

  it("re-activates a revoked invite", async () => {
    const { userId } = await createOwner("a");
    await inviteUser(userId, "friend@example.com");
    await revokeAccess("friend@example.com", NOW);
    expect(await hasAppAccess("friend@example.com")).toBe(false);

    await inviteUser(userId, "friend@example.com");

    expect(await hasAppAccess("friend@example.com")).toBe(true);
    expect(await prisma.accessInvite.count()).toBe(1);
  });
});

describe("revokeAccess", () => {
  it("signs the user out and pauses their schedule, leaving others untouched", async () => {
    const owner = await createOwner("a");
    const friend = await createOwner("b"); // owner-b@example.com
    await inviteUser(owner.userId, "owner-b@example.com");
    for (const { userId, workspaceId } of [owner, friend]) {
      await prisma.session.create({
        data: {
          id: `s-${userId}`,
          userId,
          token: `t-${userId}`,
          expiresAt: new Date(NOW.getTime() + 3_600_000),
        },
      });
      await prisma.repostSchedule.create({
        data: { workspaceId, active: true, startDate: "2026-10-01" },
      });
    }

    expect(await revokeAccess("Owner-B@example.com", NOW)).toEqual({ ok: true, data: null });

    expect(await hasAppAccess("owner-b@example.com")).toBe(false);
    expect(await prisma.session.count({ where: { userId: friend.userId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: owner.userId } })).toBe(1);
    const schedules = await prisma.repostSchedule.findMany({ orderBy: { workspaceId: "asc" } });
    expect(
      Object.fromEntries(schedules.map((schedule) => [schedule.workspaceId, schedule.active])),
    ).toEqual({ [owner.workspaceId]: true, [friend.workspaceId]: false });
    expect(
      (await prisma.accessInvite.findUniqueOrThrow({ where: { email: "owner-b@example.com" } }))
        .revokedAt,
    ).toEqual(NOW);
  });

  it("never revokes a superadmin and reports unknown emails", async () => {
    expect(await revokeAccess("owner-a@example.com", NOW)).toEqual({
      ok: false,
      error: "cannot_revoke_superadmin",
    });
    expect(await revokeAccess("nobody@example.com", NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("resolveAccess", () => {
  it("returns null for users without access", async () => {
    await createUser("user-x", "stranger@example.com");

    expect(await resolveAccess("user-x")).toBeNull();
    expect(await resolveAccess("ghost")).toBeNull();
  });

  it("demotes a stored SUPERADMIN whose email is no longer a superadmin email", async () => {
    await createUser("user-f", "friend@example.com");
    await prisma.user.update({ where: { id: "user-f" }, data: { role: "SUPERADMIN" } });
    await prisma.accessInvite.create({ data: { email: "friend@example.com" } });

    expect(await resolveAccess("user-f")).toEqual({ role: "USER" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "user-f" } })).role).toBe("USER");
  });
});
