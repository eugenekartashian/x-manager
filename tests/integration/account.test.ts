import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { inviteUser } from "@/server/services/access";
import { deleteMyAccount } from "@/server/services/account";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX } from "../helpers/fake-x";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// owner-a is the superadmin; owner-b is a regular user (M6.5).

async function fill(workspaceId: string, xUserId: string) {
  await connectXDirectly(workspaceId, { xUserId, accessToken: `token-${xUserId}` });
  const post = await prisma.ownPost.create({
    data: {
      workspaceId,
      xUserId,
      xPostId: `${xUserId}-1`,
      text: "p",
      postedAt: new Date(),
      inRotation: true,
    },
  });
  const schedule = await prisma.repostSchedule.create({
    data: { workspaceId, active: true, startDate: "2026-10-01" },
  });
  await prisma.repostSlot.create({
    data: {
      workspaceId,
      scheduleId: schedule.id,
      localTime: "10:00",
      timezone: "Europe/Madrid",
      target: "NEXT_FROM_LIST",
    },
  });
  const run = await prisma.scheduledRepost.create({
    data: {
      workspaceId,
      dedupeKey: `k-${xUserId}`,
      runAt: new Date(),
      localDate: "2026-10-01",
      ownPostId: post.id,
      xPostId: post.xPostId,
      status: "SUCCEEDED",
    },
  });
  await prisma.repostAttempt.create({
    data: {
      workspaceId,
      scheduledRepostId: run.id,
      step: "REPOST",
      outcome: "reposted",
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });
  const target = await prisma.targetAccount.create({
    data: {
      workspaceId,
      xUserId: `t-${xUserId}`,
      username: `t${xUserId}`,
      name: "T",
      lookedUpAt: new Date(),
    },
  });
  await prisma.targetPost.create({
    data: {
      workspaceId,
      targetId: target.id,
      xPostId: `tp-${xUserId}`,
      text: "t",
      postedAt: new Date(),
      fetchedAt: new Date(),
    },
  });
  await prisma.replyTemplate.create({ data: { workspaceId, text: "hi" } });
  await prisma.replyLog.create({
    data: {
      workspaceId,
      targetId: target.id,
      targetUsername: "t",
      xPostId: `tp-${xUserId}`,
      text: "hi",
      openedAt: new Date(),
    },
  });
  await prisma.externalUsage.create({
    data: { workspaceId, provider: "X", operation: "repost", units: 1, costMicros: 15_000n },
  });
  await prisma.featureUsage.create({ data: { workspaceId, kind: "TARGET_LOAD" } });
}

const TABLES = [
  "xAccount",
  "ownPost",
  "repostSchedule",
  "repostSlot",
  "scheduledRepost",
  "repostAttempt",
  "targetAccount",
  "targetPost",
  "replyTemplate",
  "replyLog",
  "externalUsage",
  "featureUsage",
] as const;

async function rowsOf(workspaceId: string) {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    // Every table has workspaceId; count through the generic delegate.
    const delegate = prisma[table] as unknown as {
      count: (args: { where: { workspaceId: string } }) => Promise<number>;
    };
    counts[table] = await delegate.count({ where: { workspaceId } });
  }
  return counts;
}

describe("deleteMyAccount", () => {
  it("deletes the user, every row they own and their invite; revokes X; keeps others", async () => {
    const owner = await createOwner("a");
    const user = await createOwner("b");
    await inviteUser(owner.userId, "owner-b@example.com");
    await fill(owner.workspaceId, "xa");
    await fill(user.workspaceId, "xb");
    await prisma.session.create({
      data: {
        id: "s-b",
        userId: user.userId,
        token: "t-b",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const x = fakeX({ revoke: () => ({ status: 200, body: {} }) });

    try {
      const result = await deleteMyAccount({
        id: user.userId,
        email: "Owner-B@example.com",
        workspaceId: user.workspaceId,
      });
      expect(result).toEqual({ ok: true, data: null });
    } finally {
      x.restore();
    }

    expect(Object.values(await rowsOf(user.workspaceId)).every((count) => count === 0)).toBe(true);
    expect(await prisma.user.count({ where: { id: user.userId } })).toBe(0);
    expect(await prisma.workspace.count({ where: { id: user.workspaceId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.userId } })).toBe(0);
    expect(await prisma.accessInvite.count({ where: { email: "owner-b@example.com" } })).toBe(0);
    expect(
      String(x.calls.find((call) => call.url.pathname === "/2/oauth2/revoke")?.body),
    ).toContain("refresh-token-xb");

    const kept = await rowsOf(owner.workspaceId);
    expect(Object.values(kept).every((count) => count >= 1)).toBe(true);
  });

  it("refuses to delete the superadmin", async () => {
    const owner = await createOwner("a");

    expect(
      await deleteMyAccount({
        id: owner.userId,
        email: "owner-a@example.com",
        workspaceId: owner.workspaceId,
      }),
    ).toEqual({ ok: false, error: "superadmin" });
    expect(await prisma.user.count()).toBe(1);
  });
});
