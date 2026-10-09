import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { CHART_DAYS, getDashboardData } from "@/server/services/dashboard";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// owner-a is the superadmin, owner-b a regular user. Madrid is UTC+2 in October.
const NOW = new Date("2026-10-10T10:00:00Z"); // 12:00 Madrid

async function workspaceOf(workspaceId: string) {
  return prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
}

async function run(
  workspaceId: string,
  runAt: Date,
  status: "SUCCEEDED" | "SKIPPED" | "FAILED" | "UNKNOWN",
) {
  await prisma.scheduledRepost.create({
    data: {
      workspaceId,
      dedupeKey: `${workspaceId}-${runAt.toISOString()}-${status}-${Math.random()}`,
      runAt,
      localDate: "2026-10-10",
      xPostId: "1",
      status,
    },
  });
}

describe("getDashboardData", () => {
  it("counts per local day, flags problems and hides money from users", async () => {
    const user = await createOwner("b");
    await connectXDirectly(user.workspaceId, { xUserId: "xb", accessToken: "tb" });
    // 23:30 UTC on 9 Oct = 01:30 on 10 Oct in Madrid → counts for 10 Oct.
    await run(user.workspaceId, new Date("2026-10-09T23:30:00Z"), "SUCCEEDED");
    await run(user.workspaceId, new Date("2026-10-10T06:00:00Z"), "FAILED");
    await run(user.workspaceId, new Date("2026-10-08T08:00:00Z"), "SKIPPED");
    await prisma.externalUsage.create({
      data: {
        workspaceId: user.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 25_000n,
        occurredAt: NOW,
      },
    });

    const data = await getDashboardData(await workspaceOf(user.workspaceId), "USER", NOW);

    expect(data.chart.days).toHaveLength(CHART_DAYS);
    expect(data.chart.days.at(-1)).toBe("2026-10-10");
    expect(data.chart.reposts.at(-1)).toEqual({ succeeded: 1, skipped: 0, problems: 1 });
    expect(data.chart.reposts.at(-3)).toEqual({ succeeded: 0, skipped: 1, problems: 0 });
    expect(data.attention.map((item) => item.action)).toContain("Open history");
    expect(data.chart.spendMicros).toBeNull();
    expect(data.today.spendMicros).toBeNull();
    expect(data.budget).toBeNull();
    expect(data.today.targetLoadsLimit).toBe(3);
  });

  it("shows spend to the superadmin and asks to connect X when missing", async () => {
    const admin = await createOwner("a");
    await prisma.externalUsage.create({
      data: {
        workspaceId: admin.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 25_000n,
        occurredAt: NOW,
      },
    });

    const data = await getDashboardData(await workspaceOf(admin.workspaceId), "SUPERADMIN", NOW);

    expect(data.today.spendMicros).toBe(25_000n);
    expect(data.chart.spendMicros?.at(-1)).toBe(25_000n);
    expect(data.attention[0]?.action).toBe("Connect X");
    expect(data.today.targetLoadsLimit).toBeNull();
  });

  it("counts creator messages and creators who reposted, per local day and workspace", async () => {
    const a = await createOwner("a");
    const b = await createOwner("b");
    const creator = await prisma.targetAccount.create({
      data: {
        workspaceId: a.workspaceId,
        xUserId: "c1",
        username: "c1",
        name: "C1",
        lookedUpAt: NOW,
      },
    });
    const event = (kind: "MESSAGE_OPENED" | "STATUS_CHANGED", createdAt: Date, undone = false) =>
      prisma.creatorEvent.create({
        data: {
          workspaceId: a.workspaceId,
          targetId: creator.id,
          kind,
          ...(kind === "STATUS_CHANGED" ? { status: "REPOSTED" as const } : { text: "hi" }),
          createdAt,
          ...(undone ? { undoneAt: NOW } : {}),
        },
      });
    await event("MESSAGE_OPENED", new Date("2026-10-09T23:30:00Z")); // 10 Oct in Madrid
    await event("MESSAGE_OPENED", new Date("2026-10-10T08:00:00Z"));
    await event("MESSAGE_OPENED", new Date("2026-10-10T08:30:00Z"), true); // undone
    await event("STATUS_CHANGED", new Date("2026-10-10T09:00:00Z"));

    const data = await getDashboardData(await workspaceOf(a.workspaceId), "SUPERADMIN", NOW);
    expect(data.today.messages).toBe(2);
    expect(data.today.messagesLimit).toBe(30);
    expect(data.chart.messages.at(-1)).toEqual({ sent: 2, reposted: 1 });

    const other = await getDashboardData(await workspaceOf(b.workspaceId), "USER", NOW);
    expect(other.today.messages).toBe(0);
    expect(other.chart.messages.every((day) => day.sent === 0 && day.reposted === 0)).toBe(true);
  });

  it("never includes another workspace's runs, replies or spend", async () => {
    const a = await createOwner("a");
    const b = await createOwner("b");
    await run(a.workspaceId, new Date("2026-10-10T08:00:00Z"), "SUCCEEDED");
    await prisma.externalUsage.create({
      data: {
        workspaceId: a.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 99_000n,
        occurredAt: NOW,
      },
    });

    const data = await getDashboardData(await workspaceOf(b.workspaceId), "SUPERADMIN", NOW);

    expect(data.chart.reposts.every((day) => day.succeeded === 0)).toBe(true);
    expect(data.recentRuns).toEqual([]);
    expect(data.today.spendMicros).toBe(0n);
  });
});
