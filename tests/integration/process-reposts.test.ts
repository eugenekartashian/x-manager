import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as runJobRoute } from "@/app/api/jobs/run/route";
import { prisma } from "@/server/db";
import { GRACE_MS, LEASE_MS, processDueReposts } from "@/server/jobs/process-due-reposts";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, repostReply } from "../helpers/fake-x";

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

const LIVE = { writesEnabled: true };
// 10:00 Madrid on 1 Oct 2026 = 08:00Z
const AT_10 = new Date("2026-10-01T08:00:00Z");
const minutes = (date: Date, delta: number) => new Date(date.getTime() + delta * 60_000);

/** Workspace with X connected, a repost list [A, B, …] and an active schedule. */
async function setup(
  options: { suffix?: "a" | "b"; list?: string[]; times?: string[]; active?: boolean } = {},
) {
  const suffix = options.suffix ?? "a";
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `x-${suffix}`,
    accessToken: `access-${suffix}`,
  });
  const ids: Record<string, string> = {};
  for (const [index, xPostId] of (options.list ?? ["A", "B"]).entries()) {
    const post = await prisma.ownPost.create({
      data: {
        workspaceId: owner.workspaceId,
        xUserId: `x-${suffix}`,
        xPostId: `${suffix}-${xPostId}`,
        text: xPostId,
        postedAt: new Date("2026-09-01T00:00:00Z"),
        inRotation: true,
        rotationPosition: index + 1,
      },
    });
    ids[xPostId] = post.id;
  }
  const schedule = await prisma.repostSchedule.create({
    data: {
      workspaceId: owner.workspaceId,
      active: options.active ?? true,
      startDate: "2026-10-01",
    },
  });
  for (const localTime of options.times ?? ["10:00"]) {
    await prisma.repostSlot.create({
      data: {
        workspaceId: owner.workspaceId,
        scheduleId: schedule.id,
        localTime,
        timezone: "Europe/Madrid",
        target: "NEXT_FROM_LIST",
      },
    });
  }
  return { ...owner, ids };
}

const okX = () => ({ undoRepost: () => repostReply(false), repost: () => repostReply(true) });

async function runsOf(workspaceId: string) {
  return prisma.scheduledRepost.findMany({
    where: { workspaceId },
    orderBy: { runAt: "asc" },
    include: { attempts: true },
  });
}

describe("processDueReposts — happy path", () => {
  it("undoes then reposts the next post from the list and records everything", async () => {
    const { workspaceId, ids } = await setup();
    const x = withFakeX(okX());

    const summary = await processDueReposts(minutes(AT_10, 2), LIVE);

    expect(summary).toMatchObject({
      workspaces: 1,
      succeeded: 1,
      skipped: 0,
      failed: 0,
      unknown: 0,
    });
    expect(x.calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "DELETE /2/users/x-a/retweets/a-A",
      "POST /2/users/x-a/retweets",
    ]);
    const [run] = await runsOf(workspaceId);
    expect(run).toMatchObject({ status: "SUCCEEDED", xPostId: "a-A", localDate: "2026-10-01" });
    expect(run?.attempts.map((item) => [item.step, item.outcome])).toEqual([
      ["UNDO", "undone"],
      ["REPOST", "reposted"],
    ]);
    expect(
      (await prisma.ownPost.findUniqueOrThrow({ where: { id: ids.A } })).lastRepostedAt,
    ).not.toBeNull();
    expect(
      (await prisma.repostSchedule.findUniqueOrThrow({ where: { workspaceId } })).listCursorPostId,
    ).toBe(ids.A);
    const usage = await prisma.externalUsage.aggregate({
      where: { workspaceId },
      _sum: { costMicros: true },
    });
    expect(usage._sum.costMicros).toBe(25_000n);
  });

  it("continues with the next post on the following occurrence", async () => {
    const { workspaceId } = await setup({ times: ["10:00", "15:00"] });
    withFakeX(okX());

    await processDueReposts(minutes(AT_10, 1), LIVE);
    await processDueReposts(minutes(AT_10, 5 * 60 + 1), LIVE);

    expect((await runsOf(workspaceId)).map((run) => run.xPostId)).toEqual(["a-A", "a-B"]);
  });

  it("does nothing before the time or after the grace window", async () => {
    await setup();
    const x = withFakeX(okX());

    await processDueReposts(minutes(AT_10, -1), LIVE);
    await processDueReposts(new Date(AT_10.getTime() + GRACE_MS + 60_000), LIVE);

    expect(x.calls).toHaveLength(0);
    expect(await prisma.scheduledRepost.count()).toBe(0);
  });

  it("does nothing while the schedule is off", async () => {
    await setup({ active: false });
    const x = withFakeX(okX());

    expect((await processDueReposts(AT_10, LIVE)).workspaces).toBe(0);
    expect(x.calls).toHaveLength(0);
  });
});

describe("processDueReposts — exactly once", () => {
  it("runs an occurrence once across repeated scheduler calls", async () => {
    await setup();
    const x = withFakeX(okX());

    await processDueReposts(minutes(AT_10, 1), LIVE);
    await processDueReposts(minutes(AT_10, 6), LIVE);
    await processDueReposts(minutes(AT_10, 11), LIVE);

    expect(x.calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(await prisma.scheduledRepost.count()).toBe(1);
  });

  it("lets only one of two concurrent workers repost", async () => {
    await setup();
    const x = withFakeX({
      undoRepost: () => repostReply(false),
      repost: () => repostReply(true),
    });

    await Promise.all([
      processDueReposts(minutes(AT_10, 1), LIVE),
      processDueReposts(minutes(AT_10, 1), LIVE),
    ]);

    expect(x.calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(await prisma.scheduledRepost.count()).toBe(1);
  });
});

describe("processDueReposts — safety switches", () => {
  it("only records a dry run when writes are disabled", async () => {
    const { workspaceId, ids } = await setup();
    const x = withFakeX({});

    const summary = await processDueReposts(minutes(AT_10, 1), { writesEnabled: false });

    expect(summary.skipped).toBe(1);
    expect(x.calls).toHaveLength(0);
    expect((await runsOf(workspaceId))[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: "dry_run",
      xPostId: "a-A",
    });
    expect(
      (await prisma.ownPost.findUniqueOrThrow({ where: { id: ids.A } })).lastRepostedAt,
    ).toBeNull();
  });

  it("skips without calling X when the monthly budget is used up", async () => {
    const { workspaceId } = await setup();
    await prisma.externalUsage.create({
      data: {
        workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 4_990_000n,
        occurredAt: AT_10,
      },
    });
    const x = withFakeX({});

    await processDueReposts(minutes(AT_10, 1), LIVE);

    expect(x.calls).toHaveLength(0);
    expect((await runsOf(workspaceId))[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: "budget_exceeded",
    });
  });

  it("records a skip when X is not connected", async () => {
    const { workspaceId } = await setup();
    await prisma.xAccount.deleteMany({ where: { workspaceId } });
    const x = withFakeX({});

    await processDueReposts(minutes(AT_10, 1), LIVE);

    expect(x.calls).toHaveLength(0);
    expect((await runsOf(workspaceId))[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: "not_connected",
    });
  });

  it("honours the daily cap across scheduler calls", async () => {
    const { workspaceId } = await setup({
      list: ["A", "B", "C"],
      times: ["10:00", "10:10", "10:20"],
    });
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { dailyRepostCap: 2, perPostMinIntervalMinutes: 120 },
    });
    withFakeX(okX());

    await processDueReposts(minutes(AT_10, 25), LIVE);

    expect(
      (await runsOf(workspaceId)).map(
        (run) => run.status + (run.skipReason ? `:${run.skipReason}` : ""),
      ),
    ).toEqual(["SUCCEEDED", "SUCCEEDED", "SKIPPED:daily_cap"]);
  });
});

describe("processDueReposts — ambiguous and failed writes", () => {
  it("re-checks once after an unknown Repost outcome and succeeds on 'already reposted'", async () => {
    const { workspaceId } = await setup();
    let call = 0;
    withFakeX({
      undoRepost: () => repostReply(false),
      repost: () =>
        ++call === 1
          ? "network-error"
          : { status: 403, body: { detail: "You have already retweeted this Post." } },
    });

    await processDueReposts(minutes(AT_10, 1), LIVE);

    const [run] = await runsOf(workspaceId);
    expect(run?.status).toBe("SUCCEEDED");
    expect(run?.attempts.map((item) => [item.step, item.outcome])).toEqual([
      ["UNDO", "undone"],
      ["REPOST", "unknown_outcome"],
      ["RECHECK", "already_reposted"],
    ]);
  });

  it("marks UNKNOWN after a failed re-check and never retries automatically", async () => {
    const { workspaceId, ids } = await setup();
    const x = withFakeX({ undoRepost: () => repostReply(false), repost: () => "network-error" });

    await processDueReposts(minutes(AT_10, 1), LIVE);
    await processDueReposts(minutes(AT_10, 6), LIVE);

    expect(x.calls.filter((call) => call.method === "POST")).toHaveLength(2); // repost + one re-check
    const [run] = await runsOf(workspaceId);
    expect(run).toMatchObject({ status: "UNKNOWN", errorCode: "unknown_outcome" });
    // Counted as reposted for the interval, since it may have happened.
    expect(
      (await prisma.ownPost.findUniqueOrThrow({ where: { id: ids.A } })).lastRepostedAt,
    ).not.toBeNull();
  });

  it("fails on a deleted post and takes it out of the list", async () => {
    const { workspaceId, ids } = await setup();
    withFakeX({ undoRepost: () => ({ status: 404, body: { title: "Not Found" } }) });

    await processDueReposts(minutes(AT_10, 1), LIVE);

    expect((await runsOf(workspaceId))[0]).toMatchObject({
      status: "FAILED",
      errorCode: "not_found",
    });
    expect((await prisma.ownPost.findUniqueOrThrow({ where: { id: ids.A } })).inRotation).toBe(
      false,
    );
  });

  it("recovers a run left PROCESSING by a crashed worker with a Repost re-check only", async () => {
    const { workspaceId, ids } = await setup();
    await prisma.scheduledRepost.create({
      data: {
        workspaceId,
        dedupeKey: "crashed",
        runAt: AT_10,
        localDate: "2026-10-01",
        ownPostId: ids.A,
        xPostId: "a-A",
        status: "PROCESSING",
        leaseUntil: minutes(AT_10, 1),
      },
    });
    await prisma.repostSchedule.update({ where: { workspaceId }, data: { active: false } });
    const x = withFakeX({
      repost: () => ({ status: 403, body: { detail: "You have already retweeted this Post." } }),
    });

    const summary = await processDueReposts(new Date(AT_10.getTime() + LEASE_MS + 60_000), LIVE);

    expect(summary.recovered).toBe(1);
    expect(x.calls.map((call) => call.method)).toEqual(["POST"]); // no undo on recovery
    expect(
      await prisma.scheduledRepost.findUniqueOrThrow({ where: { dedupeKey: "crashed" } }),
    ).toMatchObject({
      status: "SUCCEEDED",
    });
  });
});

describe("processDueReposts — isolation", () => {
  it("uses each workspace's own X account and posts", async () => {
    await setup({ suffix: "a" });
    await setup({ suffix: "b" });
    const x = withFakeX(okX());

    await processDueReposts(minutes(AT_10, 1), LIVE);

    const reposts = x.calls.filter((call) => call.method === "POST");
    expect(
      reposts
        .map((call) => [
          call.url.pathname,
          call.headers.get("authorization"),
          (call.json as { tweet_id: string }).tweet_id,
        ])
        .sort(),
    ).toEqual([
      ["/2/users/x-a/retweets", "Bearer access-a", "a-A"],
      ["/2/users/x-b/retweets", "Bearer access-b", "b-A"],
    ]);
  });
});

describe("POST /api/jobs/run", () => {
  const call = (authorization?: string) =>
    runJobRoute(
      new Request("http://127.0.0.1:3000/api/jobs/run", {
        method: "POST",
        headers: authorization ? { authorization } : {},
      }),
    );

  it("rejects missing or wrong secrets without running anything", async () => {
    await setup();
    withFakeX({});

    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(await prisma.scheduledRepost.count()).toBe(0);
  });

  it("runs the job with the right secret", async () => {
    withFakeX({});
    const response = await call("Bearer test-cron-secret-test-cron-secret-0000");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ workspaces: 0 });
  });
});
