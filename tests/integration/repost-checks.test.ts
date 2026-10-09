import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listCreators, parseCreatorFilters } from "@/server/services/creators";
import {
  checkRepostsNow,
  markRepostedBack,
  MANUAL_CHECKS_PER_DAY,
  runDailyRepostChecks,
  runRepostChecks,
} from "@/server/services/repost-checks";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, repostedByReply } from "../helpers/fake-x";

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

const NOW = new Date("2026-10-10T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

/** User "b" with own post 500, three creators: 11 and 12 messaged about it, 13 untouched. */
async function setup(options: { postUrl?: string } = {}) {
  const owner = await createOwner("b");
  await connectXDirectly(owner.workspaceId, { xUserId: "me-b", accessToken: "t-b" });
  await prisma.ownPost.create({
    data: {
      workspaceId: owner.workspaceId,
      xUserId: "me-b",
      xPostId: "500",
      text: "my post",
      postedAt: hoursAgo(100),
    },
  });
  const creators: Record<string, string> = {};
  for (const [xUserId, status] of [
    ["11", "CONTACTED"],
    ["12", "CONTACTED"],
    ["13", "NEW"],
  ] as const) {
    const target = await prisma.targetAccount.create({
      data: {
        workspaceId: owner.workspaceId,
        xUserId,
        username: `c${xUserId}`,
        name: xUserId,
        lookedUpAt: NOW,
        status,
        lastContactAt: status === "CONTACTED" ? hoursAgo(5) : null,
      },
    });
    creators[xUserId] = target.id;
    if (status === "CONTACTED") {
      await prisma.creatorEvent.create({
        data: {
          workspaceId: owner.workspaceId,
          targetId: target.id,
          kind: "MESSAGE_OPENED",
          text: "hi",
          postUrl: options.postUrl ?? "https://x.com/me_b/status/500",
          createdAt: hoursAgo(5),
        },
      });
    }
  }
  return { workspaceId: owner.workspaceId, creators };
}

const statusOf = async (id: string | undefined) =>
  (await prisma.targetAccount.findUniqueOrThrow({ where: { id: id ?? "" } })).status;

describe("runRepostChecks", () => {
  it("marks messaged creators who reposted, ignores others, pays for each returned user", async () => {
    const { workspaceId, creators } = await setup();
    const x = withFakeX({ repostedBy: () => repostedByReply(["99", "11", "13"]) });

    const result = await runRepostChecks(workspaceId, { now: NOW });

    expect(result).toEqual({
      ok: true,
      data: { posts: 1, checked: 1, newReposters: 3, matched: 1 },
    });
    expect(await statusOf(creators["11"])).toBe("REPOSTED");
    expect(await statusOf(creators["12"])).toBe("CONTACTED");
    expect(await statusOf(creators["13"])).toBe("NEW"); // never messaged
    expect(x.calls[0]?.url.searchParams.get("max_results")).toBe("20");
    expect(
      await prisma.externalUsage.count({ where: { workspaceId, operation: "userRead" } }),
    ).toBe(1);
  });

  it("skips a post already checked after today's 09:00; a forced check reads only new reposters", async () => {
    const { workspaceId, creators } = await setup();
    withFakeX({ repostedBy: () => repostedByReply(["99", "11", "13"]) });
    await runRepostChecks(workspaceId, { now: NOW });

    const quiet = withFakeX({ repostedBy: () => repostedByReply(["12"]) });
    expect((await runRepostChecks(workspaceId, { now: NOW })).ok).toBe(true);
    expect(quiet.calls).toHaveLength(0);

    // Newest first: 12 is new, then 3 already-seen accounts → stop, never asks for page 2.
    const forced = withFakeX({
      repostedBy: () => repostedByReply(["12", "99", "11", "13"], "more"),
    });
    const result = await runRepostChecks(workspaceId, { now: NOW, force: true });
    expect(result).toEqual({
      ok: true,
      data: { posts: 1, checked: 1, newReposters: 1, matched: 1 },
    });
    expect(forced.calls).toHaveLength(1);
    expect(await statusOf(creators["12"])).toBe("REPOSTED");
  });

  it("follows pagination on the first check, up to the page cap", async () => {
    const { workspaceId } = await setup();
    const x = withFakeX({
      repostedBy: (_post, token) =>
        token ? repostedByReply(["3"]) : repostedByReply(["1", "2"], "t2"),
    });
    await runRepostChecks(workspaceId, { now: NOW });
    expect(x.calls.map((call) => call.url.searchParams.get("pagination_token"))).toEqual([
      null,
      "t2",
    ]);
  });

  it("only checks the user's own posts", async () => {
    const { workspaceId } = await setup({ postUrl: "https://x.com/someone_else/status/777" });
    const x = withFakeX({ repostedBy: () => repostedByReply(["11"]) });
    expect(await runRepostChecks(workspaceId, { now: NOW })).toEqual({
      ok: true,
      data: { posts: 0, checked: 0, newReposters: 0, matched: 0 },
    });
    expect(x.calls).toHaveLength(0);
  });
});

describe("first check cap", () => {
  it("reads only the newest 2 pages of a post never checked before", async () => {
    const { workspaceId } = await setup();
    const x = withFakeX({
      repostedBy: (_post, token) =>
        repostedByReply([`u-${token ?? "0"}`], `${Number(token ?? 0) + 1}`),
    });
    await runRepostChecks(workspaceId, { now: NOW });
    expect(x.calls).toHaveLength(2);
  });
});

describe("09:00 schedule", () => {
  it("does not check before 09:00 workspace time", async () => {
    const { workspaceId } = await setup();
    const x = withFakeX({ repostedBy: () => repostedByReply(["11"]) });
    const early = new Date("2026-10-10T06:30:00Z"); // 08:30 Madrid
    expect((await runRepostChecks(workspaceId, { now: early })).ok).toBe(true);
    expect(x.calls).toHaveLength(0);
  });
});

describe("daily job", () => {
  it("checks due workspaces and turns 3-day-old silence into No reply", async () => {
    const { workspaceId, creators } = await setup();
    await prisma.targetAccount.update({
      where: { id: creators["12"] ?? "" },
      data: { lastContactAt: hoursAgo(80) },
    });
    withFakeX({ repostedBy: () => repostedByReply(["11"]) });

    const result = await runDailyRepostChecks(NOW);

    expect(result).toEqual({ workspaces: 1, matched: 1, expired: 1 });
    expect(await statusOf(creators["11"])).toBe("REPOSTED");
    expect(await statusOf(creators["12"])).toBe("NO_REPLY");
    expect(
      await prisma.creatorEvent.count({ where: { workspaceId, kind: "STATUS_CHANGED" } }),
    ).toBe(2);
  });
});

describe("Check now, reposted back and isolation", () => {
  it("limits manual checks for users and reports nothing to check", async () => {
    const { workspaceId } = await setup();
    withFakeX({ repostedBy: () => repostedByReply([]) });
    for (let i = 0; i < MANUAL_CHECKS_PER_DAY; i++) {
      expect((await checkRepostsNow(workspaceId, NOW)).ok).toBe(true);
    }
    expect(await checkRepostsNow(workspaceId, NOW)).toEqual({
      ok: false,
      error: "daily_check_limit",
    });

    const empty = await createOwner("a"); // superadmin, no promotions
    expect(await checkRepostsNow(empty.workspaceId, NOW)).toEqual({
      ok: false,
      error: "nothing_to_check",
    });
  });

  it("marks 'I reposted back', drives the owed filter, and stays inside the workspace", async () => {
    const { workspaceId, creators } = await setup();
    withFakeX({ repostedBy: () => repostedByReply(["11"]) });
    await runRepostChecks(workspaceId, { now: NOW });

    const owed = () => listCreators(workspaceId, parseCreatorFilters({ owed: "1" }));
    expect((await owed()).rows.map((row) => row.username)).toEqual(["c11"]);

    const other = await createOwner("a");
    expect(await markRepostedBack(other.workspaceId, creators["11"] ?? "", true, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await markRepostedBack(workspaceId, creators["11"] ?? "", true, NOW)).toEqual({
      ok: true,
      data: null,
    });
    expect((await owed()).rows).toEqual([]);
  });
});
