import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { suggestIdeasForPost } from "@/server/services/ai-replies";
import { saveUserLimits } from "@/server/services/limits";
import { listCap } from "@/server/services/own-posts";
import { loadTargetPosts } from "@/server/services/replies";
import { addSlot, slotCap } from "@/server/services/schedule";
import { addTargets, listTargets } from "@/server/services/targets";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { claudeReply, fakeX, postsReply, usersByReply } from "../helpers/fake-x";

let restoreFetch: (() => void) | undefined;
function withFakeX(...args: Parameters<typeof fakeX>) {
  restoreFetch?.();
  const fake = fakeX(...args);
  restoreFetch = fake.restore;
  return fake;
}

beforeEach(resetDatabase);
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});
afterAll(() => prisma.$disconnect());

// owner-a is the superadmin (SUPERADMIN_EMAILS in tests); owner-b is a regular user.
const T0 = new Date("2026-10-01T10:00:00Z"); // 12:00 Madrid
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const BETA = {
  listPosts: 4,
  dailyTimes: 2,
  targets: 3,
  targetLoadsPerDay: 3,
  aiIdeasPerTargetPerDay: 5,
  targetsEnabled: true,
  aiEnabled: true,
};

async function connected(suffix: "a" | "b") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `me-${suffix}`,
    accessToken: `t-${suffix}`,
  });
  return owner;
}

async function withTargets(suffix: "a" | "b", handles: string[]) {
  const owner = await connected(suffix);
  withFakeX({
    usersBy: usersByReply(
      Object.fromEntries(handles.map((h, i) => [h, { id: `${suffix}-u${i}` }])),
    ),
  });
  await addTargets(owner.workspaceId, handles.join("\n"), T0);
  const targets = await listTargets(owner.workspaceId, "recent");
  return { ...owner, targets };
}

describe("repost limits", () => {
  it("caps a user's list and daily times, not the superadmin's", async () => {
    const admin = await createOwner("a");
    const user = await createOwner("b");

    expect(await listCap(user.workspaceId)).toBe(4);
    expect(await slotCap(user.workspaceId)).toBe(2);
    expect(await listCap(admin.workspaceId)).toBe(25);
    expect(await slotCap(admin.workspaceId)).toBe(8);
  });

  it("refuses a third daily time for a user", async () => {
    const user = await createOwner("b");
    const ref = { id: user.workspaceId, timezone: "Europe/Madrid", perPostMinIntervalMinutes: 120 };
    const add = (localTime: string) => addSlot(ref, { localTime, timezone: "Europe/Madrid" }, T0);

    expect((await add("09:00")).ok).toBe(true);
    expect((await add("15:00")).ok).toBe(true);
    expect(await add("21:00")).toEqual({ ok: false, error: "too_many_slots" });
  });
});

describe("user repost interval (1 h)", () => {
  it("rejects a user's time less than 1 hour from another, the superadmin is not limited", async () => {
    const user = await createOwner("b");
    const admin = await createOwner("a");
    const add = (workspaceId: string, localTime: string, timezone = "Europe/Madrid") =>
      addSlot(
        { id: workspaceId, timezone: "Europe/Madrid", perPostMinIntervalMinutes: 120 },
        { localTime, timezone },
        T0,
      );

    expect((await add(user.workspaceId, "09:00")).ok).toBe(true);
    expect(await add(user.workspaceId, "09:30")).toEqual({ ok: false, error: "too_close" });
    // 09:30 London = 10:30 Madrid → 1 h 30 min apart.
    expect((await add(user.workspaceId, "09:30", "Europe/London")).ok).toBe(true);

    expect((await add(admin.workspaceId, "09:00")).ok).toBe(true);
    expect((await add(admin.workspaceId, "09:30")).ok).toBe(true);
  });
});

describe("target limits", () => {
  it("caps the number of targets and can switch Targets off", async () => {
    const user = await connected("b");
    withFakeX({
      usersBy: usersByReply({ a1: { id: "1" }, a2: { id: "2" }, a3: { id: "3" }, a4: { id: "4" } }),
    });

    expect(await addTargets(user.workspaceId, "a1 a2 a3 a4", T0)).toEqual({
      ok: false,
      error: "list_full",
    });
    expect((await addTargets(user.workspaceId, "a1 a2 a3", T0)).ok).toBe(true);

    await prisma.workspace.update({
      where: { id: user.workspaceId },
      data: { targetsEnabled: false },
    });
    expect(await addTargets(user.workspaceId, "a4", T0)).toEqual({
      ok: false,
      error: "feature_disabled",
    });
  });

  it("limits post loads per local day and resets the next day", async () => {
    const { workspaceId, targets } = await withTargets("b", ["alex"]);
    const targetId = targets[0]?.id ?? "";
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { limitTargetLoadsPerDay: 2 },
    });
    const load = (at: Date) => {
      withFakeX({ posts: () => postsReply(["p1"]) });
      return loadTargetPosts(workspaceId, targetId, at);
    };

    expect((await load(T0)).ok).toBe(true);
    expect((await load(hours(1))).ok).toBe(true);
    expect(await load(hours(2))).toEqual({ ok: false, error: "daily_load_limit" });
    expect((await load(hours(13))).ok).toBe(true); // 23:00 UTC = 01:00 next day in Madrid
  });

  it("does not limit the superadmin's loads", async () => {
    const { workspaceId, targets } = await withTargets("a", ["alex"]);
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { limitTargetLoadsPerDay: 0 },
    });
    withFakeX({ posts: () => postsReply(["p1"]) });

    expect((await loadTargetPosts(workspaceId, targets[0]?.id ?? "", T0)).ok).toBe(true);
  });
});

describe("AI limits", () => {
  it("limits ideas per target per day and can switch AI off", async () => {
    const { workspaceId, targets } = await withTargets("b", ["alex", "gio"]);
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { limitAiIdeasPerTargetDay: 2, limitTargetLoadsPerDay: 10 },
    });
    const [alex, gio] = targets.map((target) => target.id);
    for (const targetId of [alex, gio]) {
      withFakeX({ posts: () => postsReply(["p1"]) });
      await loadTargetPosts(workspaceId, targetId ?? "", T0);
    }
    const ask = (targetId: string | undefined) => {
      withFakeX({ anthropic: () => claudeReply({ ideas: ["Nice"] }) });
      return suggestIdeasForPost(workspaceId, { targetId: targetId ?? "", xPostId: "p1" }, T0);
    };

    expect((await ask(alex)).ok).toBe(true);
    expect((await ask(alex)).ok).toBe(true);
    expect(await ask(alex)).toEqual({ ok: false, error: "ai_target_limit" });
    expect((await ask(gio)).ok).toBe(true);

    await prisma.workspace.update({ where: { id: workspaceId }, data: { aiEnabled: false } });
    expect(await ask(gio)).toEqual({ ok: false, error: "ai_disabled" });
  });
});

describe("saveUserLimits", () => {
  it("updates a user's limits and budget, validating bounds", async () => {
    const user = await createOwner("b");

    expect(await saveUserLimits("Owner-B@example.com", { ...BETA, listPosts: 6 }, 12.5)).toEqual({
      ok: true,
      data: null,
    });
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
    expect(workspace.limitListPosts).toBe(6);
    expect(workspace.monthlyBudgetMicros).toBe(12_500_000n);
    expect(await listCap(user.workspaceId)).toBe(6);

    expect(await saveUserLimits("owner-b@example.com", { ...BETA, listPosts: 26 }, 10)).toEqual({
      ok: false,
      error: "invalid_limits",
    });
    expect(await saveUserLimits("owner-b@example.com", BETA, 0.5)).toEqual({
      ok: false,
      error: "invalid_limits",
    });
  });

  it("refuses the superadmin and unknown users", async () => {
    expect(await saveUserLimits("owner-a@example.com", BETA, 10)).toEqual({
      ok: false,
      error: "superadmin",
    });
    expect(await saveUserLimits("nobody@example.com", BETA, 10)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("global monthly cap", () => {
  it("stops spending for everyone once all users together reach the cap", async () => {
    const { env } = await import("@/lib/env");
    const { canSpend } = await import("@/server/services/budget");
    const a = await createOwner("a");
    const b = await createOwner("b");
    await prisma.externalUsage.create({
      data: {
        workspaceId: a.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 2_990_000n,
        occurredAt: T0,
      },
    });
    const previous = env.GLOBAL_MONTHLY_BUDGET_USD;
    try {
      env.GLOBAL_MONTHLY_BUDGET_USD = 3;
      expect(await canSpend(b.workspaceId, 10_000, T0)).toBe(true); // exactly at the cap
      expect(await canSpend(b.workspaceId, 10_001, T0)).toBe(false);
      env.GLOBAL_MONTHLY_BUDGET_USD = undefined;
      expect(await canSpend(b.workspaceId, 10_001, T0)).toBe(true);
    } finally {
      env.GLOBAL_MONTHLY_BUDGET_USD = previous;
    }
  });
});
