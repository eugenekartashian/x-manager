import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  addPostToRotationByUrl,
  getPostsPageData,
  moveInRotation,
  refreshOwnPosts,
  REFRESH_MIN_INTERVAL_MS,
  setInRotation,
} from "@/server/services/own-posts";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, meReply, postReply, postsReply } from "../helpers/fake-x";

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

const T0 = new Date("2026-09-28T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

async function connectedOwner(suffix: "a" | "b" = "a") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `x-${suffix}`,
    accessToken: `access-${suffix}`,
  });
  return owner;
}

async function rotationIds(workspaceId: string) {
  const data = await getPostsPageData(workspaceId, T0);
  return data.connected ? data.rotation.map((post) => post.xPostId) : [];
}

async function seedPosts(workspaceId: string, ids: string[], pinned?: string) {
  withFakeX({ posts: () => postsReply(ids), me: () => meReply("x-a", "a", pinned) });
  const result = await refreshOwnPosts(workspaceId, T0);
  expect(result.ok).toBe(true);
}

async function postId(workspaceId: string, xPostId: string) {
  const post = await prisma.ownPost.findFirstOrThrow({ where: { workspaceId, xPostId } });
  return post.id;
}

describe("refreshOwnPosts", () => {
  it("loads recent posts, marks the pinned one and records the cost", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({
      posts: () => postsReply(["3", "2", "1"]),
      me: () => meReply("x-a", "a", "2"),
    });

    expect(await refreshOwnPosts(owner.workspaceId, T0)).toEqual({ ok: true, data: { synced: 3 } });

    const stored = await prisma.ownPost.findMany({
      where: { workspaceId: owner.workspaceId },
      orderBy: { xPostId: "asc" },
    });
    expect(stored.map((post) => [post.xPostId, post.isPinned, post.likeCount])).toEqual([
      ["1", false, 3],
      ["2", true, 3],
      ["3", false, 3],
    ]);
    expect(x.calls.map((call) => call.url.pathname)).toEqual([
      "/2/users/x-a/tweets",
      "/2/users/me",
    ]);
    const usage = await prisma.externalUsage.aggregate({
      where: { workspaceId: owner.workspaceId },
      _sum: { costMicros: true },
    });
    expect(usage._sum.costMicros).toBe(3n * 1_000n + 10_000n);
  });

  it("fetches an old pinned post that is not in the recent page", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({
      posts: () => postsReply(["3"]),
      me: () => meReply("x-a", "a", "old-9"),
      post: (id) => postReply(id, "x-a"),
    });

    await refreshOwnPosts(owner.workspaceId, T0);

    expect(x.calls.at(-1)?.url.pathname).toBe("/2/tweets/old-9");
    const pinned = await prisma.ownPost.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId, isPinned: true },
    });
    expect(pinned.xPostId).toBe("old-9");
  });

  it("re-fetches an old pinned post on every refresh to update media and metrics", async () => {
    const owner = await connectedOwner();
    withFakeX({
      posts: () => postsReply(["3"]),
      me: () => meReply("x-a", "a", "old-9"),
      post: (id) => postReply(id, "x-a"),
    });
    await refreshOwnPosts(owner.workspaceId, T0);

    const x = withFakeX({
      posts: () => postsReply(["3"]),
      me: () => meReply("x-a", "a", "old-9"),
      post: (id) => ({
        status: 200,
        body: {
          data: {
            id,
            text: "pinned",
            author_id: "x-a",
            created_at: "2025-07-30T09:28:00.000Z",
            attachments: { media_keys: ["v1"] },
          },
          includes: {
            media: [
              {
                media_key: "v1",
                type: "video",
                preview_image_url: "https://pbs.twimg.com/thumb/v.jpg",
              },
            ],
          },
        },
      }),
    });
    await refreshOwnPosts(owner.workspaceId, later(REFRESH_MIN_INTERVAL_MS + 1));

    expect(x.calls.some((call) => call.url.pathname === "/2/tweets/old-9")).toBe(true);
    const pinned = await prisma.ownPost.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId, xPostId: "old-9" },
    });
    expect(pinned).toMatchObject({
      isPinned: true,
      mediaType: "video",
      mediaPreviewUrl: "https://pbs.twimg.com/thumb/v.jpg",
    });
  });

  it("does not fetch the pinned post separately when it is in the recent page", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({
      posts: () => postsReply(["3", "2"]),
      me: () => meReply("x-a", "a", "2"),
    });

    await refreshOwnPosts(owner.workspaceId, T0);

    expect(x.calls.some((call) => call.url.pathname.startsWith("/2/tweets/"))).toBe(false);
  });

  it("drops cached posts that left the recent page unless listed or pinned", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["4", "3", "2", "1"], "1");
    await setInRotation(owner.workspaceId, await postId(owner.workspaceId, "2"), true);
    withFakeX({
      posts: () => postsReply(["5", "4"]),
      me: () => meReply("x-a", "a", "1"),
      post: (id) => postReply(id, "x-a"),
    });

    await refreshOwnPosts(owner.workspaceId, later(REFRESH_MIN_INTERVAL_MS + 1));

    const ids = (await prisma.ownPost.findMany({ where: { workspaceId: owner.workspaceId } }))
      .map((p) => p.xPostId)
      .sort();
    expect(ids).toEqual(["1", "2", "4", "5"]); // 3 dropped; 2 (listed) and 1 (pinned) kept
  });

  it("moves the pinned flag when the user pins another post", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["2", "1"], "1");
    withFakeX({ posts: () => postsReply(["2", "1"]), me: () => meReply("x-a", "a", "2") });

    await refreshOwnPosts(owner.workspaceId, later(REFRESH_MIN_INTERVAL_MS + 1));

    const pinned = await prisma.ownPost.findMany({
      where: { workspaceId: owner.workspaceId, isPinned: true },
    });
    expect(pinned.map((post) => post.xPostId)).toEqual(["2"]);
  });

  it("keeps rotation choices when posts are refreshed", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["2", "1"]);
    await setInRotation(owner.workspaceId, await postId(owner.workspaceId, "1"), true);
    withFakeX({ posts: () => postsReply(["2", "1"]), me: () => meReply("x-a") });

    await refreshOwnPosts(owner.workspaceId, later(REFRESH_MIN_INTERVAL_MS + 1));

    expect(await rotationIds(owner.workspaceId)).toEqual(["1"]);
  });

  it("refuses a second refresh within a minute without calling X", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["1"]);
    const x = withFakeX({});

    expect(await refreshOwnPosts(owner.workspaceId, later(30_000))).toEqual({
      ok: false,
      error: "too_soon",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("lets only one of two simultaneous refreshes reach X", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ posts: () => postsReply(["1"]), me: () => meReply("x-a") });

    const results = await Promise.all([
      refreshOwnPosts(owner.workspaceId, T0),
      refreshOwnPosts(owner.workspaceId, T0),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, error: "too_soon" });
    expect(x.calls.filter((call) => call.url.pathname === "/2/users/x-a/tweets")).toHaveLength(1);
  });

  it("stops before calling X when the monthly budget is used up", async () => {
    const owner = await connectedOwner();
    await prisma.externalUsage.create({
      data: {
        workspaceId: owner.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 4_990_000n,
        occurredAt: T0,
      },
    });
    const x = withFakeX({});

    expect(await refreshOwnPosts(owner.workspaceId, T0)).toEqual({
      ok: false,
      error: "budget_exceeded",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("ignores last month's spend", async () => {
    const owner = await connectedOwner();
    await prisma.externalUsage.create({
      data: {
        workspaceId: owner.workspaceId,
        provider: "X",
        operation: "repost",
        units: 1,
        costMicros: 5_000_000n,
        occurredAt: new Date("2026-08-31T23:59:00Z"),
      },
    });
    withFakeX({ posts: () => postsReply([]), me: () => meReply("x-a") });

    expect((await refreshOwnPosts(owner.workspaceId, T0)).ok).toBe(true);
  });

  it("requires a connected X account", async () => {
    const owner = await createOwner("a");
    expect(await refreshOwnPosts(owner.workspaceId, T0)).toEqual({
      ok: false,
      error: "not_connected",
    });
  });
});

describe("addPostToRotationByUrl", () => {
  it("adds an already loaded post without calling X", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["123"]);
    const x = withFakeX({});

    const result = await addPostToRotationByUrl(
      owner.workspaceId,
      "https://x.com/a/status/123",
      T0,
    );

    expect(result).toEqual({ ok: true, data: { xPostId: "123" } });
    expect(x.calls).toHaveLength(0);
    expect(await rotationIds(owner.workspaceId)).toEqual(["123"]);
  });

  it("fetches and verifies an older own post, then appends it", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["5"]);
    await setInRotation(owner.workspaceId, await postId(owner.workspaceId, "5"), true);
    const x = withFakeX({ post: (id) => postReply(id, "x-a") });

    const result = await addPostToRotationByUrl(owner.workspaceId, "x.com/a/status/42?s=20", T0);

    expect(result).toEqual({ ok: true, data: { xPostId: "42" } });
    expect(x.calls[0]?.url.pathname).toBe("/2/tweets/42");
    expect(await rotationIds(owner.workspaceId)).toEqual(["5", "42"]);
  });

  it("rejects someone else's post and stores nothing", async () => {
    const owner = await connectedOwner();
    withFakeX({ post: (id) => postReply(id, "someone-else") });

    expect(
      await addPostToRotationByUrl(owner.workspaceId, "https://x.com/elon/status/77", T0),
    ).toEqual({
      ok: false,
      error: "not_own_post",
    });
    expect(await prisma.ownPost.count()).toBe(0);
  });

  it.each([
    ["200 without data", { status: 200, body: { errors: [{ title: "Not Found Error" }] } }],
    ["404", { status: 404, body: { title: "Not Found" } }],
  ])("reports a missing post (%s)", async (_label, reply) => {
    const owner = await connectedOwner();
    withFakeX({ post: () => reply });

    expect(await addPostToRotationByUrl(owner.workspaceId, "123", T0)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("rejects input that is not a post link, without calling X", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({});

    expect(
      await addPostToRotationByUrl(owner.workspaceId, "https://evil.com/a/status/1", T0),
    ).toEqual({
      ok: false,
      error: "invalid_url",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("is idempotent", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["1"]);

    await addPostToRotationByUrl(owner.workspaceId, "1", T0);
    await addPostToRotationByUrl(owner.workspaceId, "1", T0);

    expect(await rotationIds(owner.workspaceId)).toEqual(["1"]);
  });
});

describe("rotation editing", () => {
  it("adds in order, reorders and removes", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["3", "2", "1"]);
    for (const id of ["1", "2", "3"]) {
      await setInRotation(owner.workspaceId, await postId(owner.workspaceId, id), true);
    }

    await moveInRotation(owner.workspaceId, await postId(owner.workspaceId, "3"), "up");
    expect(await rotationIds(owner.workspaceId)).toEqual(["1", "3", "2"]);

    await moveInRotation(owner.workspaceId, await postId(owner.workspaceId, "1"), "up"); // already first
    expect(await rotationIds(owner.workspaceId)).toEqual(["1", "3", "2"]);

    await setInRotation(owner.workspaceId, await postId(owner.workspaceId, "3"), false);
    expect(await rotationIds(owner.workspaceId)).toEqual(["1", "2"]);
  });

  it("never lets one workspace edit another workspace's posts", async () => {
    const ownerA = await connectedOwner("a");
    const ownerB = await connectedOwner("b");
    await seedPosts(ownerA.workspaceId, ["1"]);
    const postOfA = await postId(ownerA.workspaceId, "1");

    expect(await setInRotation(ownerB.workspaceId, postOfA, true)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await moveInRotation(ownerB.workspaceId, postOfA, "up")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect((await prisma.ownPost.findUniqueOrThrow({ where: { id: postOfA } })).inRotation).toBe(
      false,
    );
  });

  it("hides posts of a previously connected, different X account", async () => {
    const owner = await connectedOwner();
    await seedPosts(owner.workspaceId, ["1"]);
    await setInRotation(owner.workspaceId, await postId(owner.workspaceId, "1"), true);

    // Reconnect the workspace to another X account.
    await prisma.xAccount.update({
      where: { workspaceId: owner.workspaceId },
      data: { xUserId: "x-other" },
    });

    const data = await getPostsPageData(owner.workspaceId, T0);
    expect(data.connected && data.rotation).toEqual([]);
    expect(data.connected && data.recent).toEqual([]);
  });
});
