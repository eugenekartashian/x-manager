import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { recordUsage } from "@/server/repositories/usage";
import { budgetLevel, saveMonthlyBudget } from "@/server/services/budget";
import { getHistoryPageData } from "@/server/services/history";
import { fetchOwnPosts } from "@/server/services/x-api";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX } from "../helpers/fake-x";

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

const DAY_1 = new Date("2026-10-01T10:00:00Z");
const DAY_1_LATER = new Date("2026-10-01T23:59:00Z");
const DAY_2 = new Date("2026-10-02T00:01:00Z");

const read = (workspaceId: string, ids: string[], now: Date) =>
  recordUsage({
    workspaceId,
    provider: "X",
    operation: "ownedPostRead",
    units: ids.length,
    unitPriceMicros: 1_000,
    resources: { kind: "post", ids },
    now,
  });

describe("X same-day deduplication", () => {
  it("bills each read resource once per UTC day", async () => {
    const { workspaceId } = await createOwner("a");

    expect(await read(workspaceId, ["1", "2", "3"], DAY_1)).toEqual({ billedUnits: 3 });
    expect(await read(workspaceId, ["2", "3", "4"], DAY_1_LATER)).toEqual({ billedUnits: 1 });
    expect(await read(workspaceId, ["1", "2"], DAY_2)).toEqual({ billedUnits: 2 });

    const rows = await prisma.externalUsage.findMany({
      where: { workspaceId },
      orderBy: { occurredAt: "asc" },
    });
    expect(rows.map((row) => [row.units, row.billedUnits, row.costMicros])).toEqual([
      [3, 3, 3_000n],
      [3, 1, 1_000n],
      [2, 2, 2_000n],
    ]);
  });

  it("does not share deduplication between workspaces", async () => {
    const a = await createOwner("a");
    const b = await createOwner("b");

    await read(a.workspaceId, ["1"], DAY_1);

    expect(await read(b.workspaceId, ["1"], DAY_1)).toEqual({ billedUnits: 1 });
  });

  it("bills writes per request (no resources)", async () => {
    const { workspaceId } = await createOwner("a");
    for (let i = 0; i < 2; i++) {
      await recordUsage({
        workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        unitPriceMicros: 15_000,
        now: DAY_1,
      });
    }
    const total = await prisma.externalUsage.aggregate({
      where: { workspaceId },
      _sum: { costMicros: true },
    });
    expect(total._sum.costMicros).toBe(30_000n);
  });

  it("counts filtered replies too, because X bills every returned post", async () => {
    const owner = await createOwner("a");
    await connectXDirectly(owner.workspaceId, { xUserId: "x-a", accessToken: "t" });
    withFakeX({
      posts: () => ({
        status: 200,
        body: {
          data: [
            { id: "1", text: "post", created_at: "2026-09-20T10:00:00.000Z" },
            {
              id: "2",
              text: "link",
              created_at: "2026-09-20T10:01:00.000Z",
              in_reply_to_user_id: "x-a",
            },
          ],
          meta: { result_count: 2 },
        },
      }),
    });

    const result = await fetchOwnPosts(owner.workspaceId);

    expect(result.ok && result.data.posts.map((post) => post.id)).toEqual(["1"]);
    const row = await prisma.externalUsage.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect([row.units, row.billedUnits]).toEqual([2, 2]);
  });
});

describe("budget", () => {
  it("classifies usage against the budget", () => {
    expect(budgetLevel({ spentMicros: 3_900_000n, budgetMicros: 5_000_000n })).toBe("ok");
    expect(budgetLevel({ spentMicros: 4_000_000n, budgetMicros: 5_000_000n })).toBe("warning");
    expect(budgetLevel({ spentMicros: 5_000_000n, budgetMicros: 5_000_000n })).toBe("exhausted");
  });

  it("accepts budgets between $1 and $500 in whole cents", async () => {
    const { workspaceId } = await createOwner("a");

    for (const bad of [0.5, 501, Number.NaN]) {
      expect(await saveMonthlyBudget(workspaceId, bad)).toEqual({
        ok: false,
        error: "invalid_budget",
      });
    }
    expect(await saveMonthlyBudget(workspaceId, 12.345)).toEqual({ ok: true, data: null });
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(workspace.monthlyBudgetMicros).toBe(12_350_000n);
  });
});

describe("history", () => {
  async function run(
    workspaceId: string,
    key: string,
    status: "SUCCEEDED" | "FAILED" | "SKIPPED",
    runAt: Date,
  ) {
    await prisma.scheduledRepost.create({
      data: {
        workspaceId,
        dedupeKey: key,
        runAt,
        localDate: "2026-10-01",
        status,
        finishedAt: runAt,
      },
    });
  }

  it("filters runs and counts this month, for the caller's workspace only", async () => {
    const a = await createOwner("a");
    const b = await createOwner("b");
    await run(a.workspaceId, "a1", "SUCCEEDED", DAY_1);
    await run(a.workspaceId, "a2", "FAILED", DAY_1_LATER);
    await run(a.workspaceId, "a3", "SKIPPED", DAY_2);
    await run(a.workspaceId, "old", "SUCCEEDED", new Date("2026-09-30T10:00:00Z"));
    await run(b.workspaceId, "b1", "SUCCEEDED", DAY_1);
    await read(a.workspaceId, ["1"], DAY_1);

    const all = await getHistoryPageData(a.workspaceId, "all", DAY_2);
    expect(all.runs.map((item) => item.dedupeKey)).toEqual(["a3", "a2", "a1", "old"]);
    expect(all.monthCounts).toMatchObject({ SUCCEEDED: 1, FAILED: 1, SKIPPED: 1 });
    expect(all.spend).toEqual([
      { operation: "ownedPostRead", calls: 1, billedUnits: 1, costMicros: 1_000n },
    ]);

    expect(
      (await getHistoryPageData(a.workspaceId, "reposted", DAY_2)).runs.map(
        (item) => item.dedupeKey,
      ),
    ).toEqual(["a1", "old"]);
    expect(
      (await getHistoryPageData(a.workspaceId, "problems", DAY_2)).runs.map(
        (item) => item.dedupeKey,
      ),
    ).toEqual(["a2"]);
  });
});
