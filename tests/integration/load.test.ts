import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { processDueReposts } from "@/server/jobs/process-due-reposts";
import { connectXDirectly, createUser, resetDatabase } from "../helpers/db";
import { fakeX, repostReply } from "../helpers/fake-x";

// Load test (M6.4): many users with Reposts due at the same minute. Fake X, no network.

const USERS = 200;
const POSTS_PER_USER = 2; // beta limit
const AT_10 = new Date("2026-10-01T08:00:00Z"); // 10:00 Madrid
const at = (minutes: number) => new Date(AT_10.getTime() + minutes * 60_000);

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});
afterAll(() => prisma.$disconnect());

async function seedUsers(): Promise<void> {
  await resetDatabase();
  for (let index = 0; index < USERS; index++) {
    const user = await createUser(`load-${index}`, `load-${index}@example.com`);
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: "w" } });
    await connectXDirectly(workspace.id, { xUserId: `lx-${index}`, accessToken: `lt-${index}` });
    await prisma.ownPost.createMany({
      data: Array.from({ length: POSTS_PER_USER }, (_, position) => ({
        workspaceId: workspace.id,
        xUserId: `lx-${index}`,
        xPostId: `${index}${position}`,
        text: "post",
        postedAt: new Date("2026-09-01T00:00:00Z"),
        inRotation: true,
        rotationPosition: position + 1,
      })),
    });
    const schedule = await prisma.repostSchedule.create({
      data: {
        workspaceId: workspace.id,
        active: true,
        startDate: "2026-10-01",
        consentedAt: new Date("2026-09-30T00:00:00Z"),
      },
    });
    await prisma.repostSlot.create({
      data: {
        workspaceId: workspace.id,
        scheduleId: schedule.id,
        localTime: "10:00",
        timezone: "Europe/Madrid",
        target: "NEXT_FROM_LIST",
      },
    });
  }
}

function fakeXOk() {
  const fake = fakeX({ undoRepost: () => repostReply(false), repost: () => repostReply(true) });
  restoreFetch = fake.restore;
  return fake;
}

async function expectEachPostRepostedOnce(repostCalls: number) {
  const runs = await prisma.scheduledRepost.findMany({ select: { dedupeKey: true, status: true } });
  expect(runs).toHaveLength(USERS * POSTS_PER_USER);
  expect(new Set(runs.map((run) => run.dedupeKey)).size).toBe(USERS * POSTS_PER_USER);
  expect(runs.every((run) => run.status === "SUCCEEDED")).toBe(true);
  expect(repostCalls).toBe(USERS * POSTS_PER_USER);
}

describe(`load: ${USERS} users due at the same time`, () => {
  beforeAll(seedUsers, 120_000);

  it("reposts every post exactly once even when two scheduler calls overlap", async () => {
    const x = fakeXOk();
    const options = { writesEnabled: true, pauseBetweenMs: 5, concurrency: 8 };

    const started = Date.now();
    const [first, second] = await Promise.all([
      processDueReposts(at(1), options),
      processDueReposts(at(1), options),
    ]);
    const elapsedMs = Date.now() - started;

    expect(first.succeeded + second.succeeded).toBe(USERS * POSTS_PER_USER);
    const repostCalls = x.calls.filter((call) => call.method === "POST").length;
    await expectEachPostRepostedOnce(repostCalls);
    expect(elapsedMs).toBeLessThan(45_000); // one invocation's time budget
  }, 120_000);
});

describe(`load: deadline hands the rest to the next call`, () => {
  beforeAll(seedUsers, 120_000);

  it("finishes over several short calls without duplicates or skipped users", async () => {
    const x = fakeXOk();
    const options = { writesEnabled: true, pauseBetweenMs: 20, concurrency: 8, timeBudgetMs: 300 };

    let calls = 0;
    let total = 0;
    // Scheduler every 5 min within the 30 min grace window → at most 6 calls in production.
    while (total < USERS * POSTS_PER_USER && calls < 50) {
      total += (await processDueReposts(at(1 + calls * 0.01), options)).succeeded;
      calls++;
    }

    expect(calls).toBeGreaterThan(1); // the deadline really split the work
    const repostCalls = x.calls.filter((call) => call.method === "POST").length;
    await expectEachPostRepostedOnce(repostCalls);
  }, 120_000);
});
