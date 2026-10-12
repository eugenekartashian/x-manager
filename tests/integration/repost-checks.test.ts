import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { USER_CHECKS_PER_DAY } from "@/server/domain/repost-check-rules";
import { listCreators, parseCreatorFilters } from "@/server/services/creators";
import {
  checkAllWaiting,
  checkCreatorRepost,
  expireStaleMessaged,
  markRepostedBack,
  markRepostedByHand,
  repostProofFor,
} from "@/server/services/repost-checks";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, searchReply } from "../helpers/fake-x";

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

/** User "b": creator 11 messaged 5 h ago with a link to post 500. */
async function setup(options: { messageAt?: Date; status?: "CONTACTED" | "PARTNER" } = {}) {
  const owner = await createOwner("b");
  await connectXDirectly(owner.workspaceId, { xUserId: "me-b", accessToken: "t-b" });
  const target = await prisma.targetAccount.create({
    data: {
      workspaceId: owner.workspaceId,
      xUserId: "11",
      username: "c11",
      name: "C11",
      lookedUpAt: NOW,
      status: options.status ?? "CONTACTED",
      lastContactAt: options.messageAt ?? hoursAgo(5),
    },
  });
  await prisma.creatorEvent.create({
    data: {
      workspaceId: owner.workspaceId,
      targetId: target.id,
      kind: "MESSAGE_OPENED",
      text: "hi",
      postUrl: "https://x.com/me_b/status/500",
      createdAt: options.messageAt ?? hoursAgo(5),
    },
  });
  return { workspaceId: owner.workspaceId, targetId: target.id };
}

const statusOf = async (id: string) =>
  (await prisma.targetAccount.findUniqueOrThrow({ where: { id } })).status;

describe("checkCreatorRepost", () => {
  it("asks X exactly for this author's repost/quote of the post and marks Reposted", async () => {
    const { workspaceId, targetId } = await setup();
    const x = withFakeX({
      search: () => searchReply([{ id: "900", kind: "repost", postId: "500" }]),
    });

    const result = await checkCreatorRepost(workspaceId, targetId, NOW);

    expect(result).toEqual({
      ok: true,
      data: { found: true, kind: "repost", url: "https://x.com/me_b/status/500/retweets" },
    });
    expect(x.calls[0]?.url.pathname).toBe("/2/tweets/search/recent");
    expect(x.calls[0]?.url.searchParams.get("query")).toBe(
      "from:11 (retweets_of_tweet_id:500 OR quotes_of_tweet_id:500)",
    );
    expect(await statusOf(targetId)).toBe("REPOSTED");
    // A plain Repost is visible in the post's Reposts list.
    expect(await repostProofFor(workspaceId, targetId)).toBe(
      "https://x.com/me_b/status/500/retweets",
    );
    const usage = await prisma.externalUsage.findFirstOrThrow({ where: { workspaceId } });
    expect([usage.operation, usage.units, usage.costMicros]).toEqual(["postRead", 1, 5_000n]);
  });

  it("recognises a quote", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({ search: () => searchReply([{ id: "901", kind: "quote", postId: "500" }]) });
    const result = await checkCreatorRepost(workspaceId, targetId, NOW);
    expect(result.ok && result.data.found && result.data.kind).toBe("quote");
    expect(await repostProofFor(workspaceId, targetId)).toBe("https://x.com/c11/status/901");
    // Proof links stay inside the workspace.
    const other = await createOwner("a");
    expect(await repostProofFor(other.workspaceId, targetId)).toBeNull();
  });

  it("not found: nothing changes and nothing is billed", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({ search: () => searchReply([]) });
    expect(await checkCreatorRepost(workspaceId, targetId, NOW)).toEqual({
      ok: true,
      data: { found: false },
    });
    expect(await statusOf(targetId)).toBe("CONTACTED");
    expect(await prisma.externalUsage.count({ where: { workspaceId } })).toBe(0);
  });

  it("needs a message with a post in the last 7 days (undone messages don't count)", async () => {
    const old = await setup({ messageAt: hoursAgo(8 * 24) });
    const x = withFakeX({ search: () => searchReply([]) });
    expect(await checkCreatorRepost(old.workspaceId, old.targetId, NOW)).toEqual({
      ok: false,
      error: "no_promoted_post",
    });
    await prisma.creatorEvent.updateMany({
      data: { createdAt: hoursAgo(1), undoneAt: hoursAgo(1) },
    });
    expect(await checkCreatorRepost(old.workspaceId, old.targetId, NOW)).toEqual({
      ok: false,
      error: "no_promoted_post",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("keeps partners as partners and limits users to 30 checks a day", async () => {
    const { workspaceId, targetId } = await setup({ status: "PARTNER" });
    withFakeX({ search: () => searchReply([{ id: "900", kind: "repost", postId: "500" }]) });
    expect((await checkCreatorRepost(workspaceId, targetId, NOW)).ok).toBe(true);
    expect(await statusOf(targetId)).toBe("PARTNER");

    await prisma.featureUsage.createMany({
      data: Array.from({ length: USER_CHECKS_PER_DAY }, () => ({
        workspaceId,
        kind: "REPOST_CHECK" as const,
        occurredAt: NOW,
      })),
    });
    expect(await checkCreatorRepost(workspaceId, targetId, NOW)).toEqual({
      ok: false,
      error: "daily_check_limit",
    });
  });
});

describe("checkAllWaiting", () => {
  it("checks each waiting creator with a promoted post", async () => {
    const { workspaceId } = await setup();
    const other = await prisma.targetAccount.create({
      data: {
        workspaceId,
        xUserId: "12",
        username: "c12",
        name: "C12",
        lookedUpAt: NOW,
        status: "CONTACTED",
        lastContactAt: hoursAgo(2),
      },
    });
    await prisma.creatorEvent.create({
      data: {
        workspaceId,
        targetId: other.id,
        kind: "MESSAGE_OPENED",
        text: "hey",
        postUrl: "https://x.com/me_b/status/501",
        createdAt: hoursAgo(2),
      },
    });
    withFakeX({
      search: (query) =>
        query.includes("from:12")
          ? searchReply([{ id: "950", kind: "repost", postId: "501" }])
          : searchReply([]),
    });

    expect(await checkAllWaiting(workspaceId, NOW)).toEqual({
      checked: 2,
      found: 1,
      stoppedBy: null,
    });
    expect(await statusOf(other.id)).toBe("REPOSTED");
  });
});

describe("expiry, reposted back and isolation", () => {
  it("turns 3-day-old silence into No reply for free", async () => {
    const { targetId } = await setup({ messageAt: hoursAgo(80) });
    const x = withFakeX({});
    expect(await expireStaleMessaged(NOW)).toBe(1);
    expect(await statusOf(targetId)).toBe("NO_REPLY");
    expect(x.calls).toHaveLength(0);
  });

  it("marks 'I reposted back', drives the owed filter, and stays inside the workspace", async () => {
    const { workspaceId, targetId } = await setup();
    withFakeX({ search: () => searchReply([{ id: "900", kind: "repost", postId: "500" }]) });
    await checkCreatorRepost(workspaceId, targetId, NOW);

    const owed = () => listCreators(workspaceId, parseCreatorFilters({ owed: "1" }));
    expect((await owed()).rows.map((row) => row.username)).toEqual(["c11"]);

    const other = await createOwner("a");
    expect(await checkCreatorRepost(other.workspaceId, targetId, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await markRepostedBack(other.workspaceId, targetId, true, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await markRepostedBack(workspaceId, targetId, true, NOW)).toEqual({
      ok: true,
      data: null,
    });
    expect((await owed()).rows).toEqual([]);
  });
});

describe("markRepostedByHand", () => {
  it("marks Reposted (and optionally reposted back) without calling X, only in its workspace", async () => {
    const { workspaceId, targetId } = await setup();
    const x = withFakeX({});
    const other = await createOwner("a");
    expect(await markRepostedByHand(other.workspaceId, targetId, true, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });

    expect(await markRepostedByHand(workspaceId, targetId, true, NOW)).toEqual({
      ok: true,
      data: null,
    });
    const row = await prisma.targetAccount.findUniqueOrThrow({ where: { id: targetId } });
    expect([row.status, row.theyRepostedAt, row.repostedBackAt]).toEqual(["REPOSTED", NOW, NOW]);
    expect(await repostProofFor(workspaceId, targetId)).toBeNull();
    expect(x.calls).toHaveLength(0);
    expect(await prisma.externalUsage.count()).toBe(0);
  });
});
