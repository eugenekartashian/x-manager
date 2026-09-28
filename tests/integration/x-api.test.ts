import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  fetchOwnPosts,
  fetchPinnedPostId,
  repostPost,
  undoRepostPost,
} from "@/server/services/x-api";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, meReply, postsReply, repostReply } from "../helpers/fake-x";

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

async function connectedOwner(suffix: "a" | "b" = "a") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `x-${suffix}`,
    accessToken: `access-${suffix}`,
  });
  return owner;
}

async function usageRows(workspaceId: string) {
  const rows = await prisma.externalUsage.findMany({ where: { workspaceId } });
  return rows.map(({ operation, units, costMicros }) => ({ operation, units, costMicros }));
}

describe("fetchOwnPosts", () => {
  it("requests own original posts and records owned-read cost per post", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ posts: () => postsReply(["101", "100"], "next-page") });

    const result = await fetchOwnPosts(owner.workspaceId, { maxResults: 20 });

    const call = x.calls[0];
    expect(call?.url.pathname).toBe("/2/users/x-a/tweets");
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
      max_results: "20",
      exclude: "replies,retweets",
      "tweet.fields": "created_at,public_metrics,attachments,in_reply_to_user_id,referenced_tweets",
      expansions: "attachments.media_keys",
      "media.fields": "type,url,preview_image_url",
    });
    expect(call?.headers.get("authorization")).toBe("Bearer access-a");
    expect(result).toMatchObject({
      ok: true,
      data: {
        nextToken: "next-page",
        posts: [
          { id: "101", text: "Post 101", metrics: { likes: 3, impressions: 100 } },
          { id: "100" },
        ],
      },
    });
    if (result.ok) expect(result.data.posts[0]?.createdAt).toBeInstanceOf(Date);
    expect(await usageRows(owner.workspaceId)).toEqual([
      { operation: "ownedPostRead", units: 2, costMicros: 2_000n },
    ]);
  });

  it("handles an account with no posts and records no cost", async () => {
    const owner = await connectedOwner();
    withFakeX({ posts: () => postsReply([]) });

    expect(await fetchOwnPosts(owner.workspaceId)).toEqual({
      ok: true,
      data: { posts: [], nextToken: null },
    });
    expect(await usageRows(owner.workspaceId)).toEqual([]);
  });

  it("clamps page size to X's 5–100 range and forwards the pagination token", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ posts: () => postsReply([]) });

    await fetchOwnPosts(owner.workspaceId, { maxResults: 500, paginationToken: "p2" });
    await fetchOwnPosts(owner.workspaceId, { maxResults: 1 });

    expect(x.calls[0]?.url.searchParams.get("max_results")).toBe("100");
    expect(x.calls[0]?.url.searchParams.get("pagination_token")).toBe("p2");
    expect(x.calls[1]?.url.searchParams.get("max_results")).toBe("5");
  });

  it("maps a rate limit without recording cost", async () => {
    const owner = await connectedOwner();
    withFakeX({ posts: () => ({ status: 429, body: { title: "Too Many Requests" } }) });

    expect(await fetchOwnPosts(owner.workspaceId)).toEqual({ ok: false, error: "rate_limited" });
    expect(await usageRows(owner.workspaceId)).toEqual([]);
  });

  it("treats a failed read as retryable, not as an unknown outcome", async () => {
    const owner = await connectedOwner();
    withFakeX({ posts: () => "network-error" });

    expect(await fetchOwnPosts(owner.workspaceId)).toEqual({ ok: false, error: "x_unavailable" });
  });

  it("uses only the caller's own X account and token", async () => {
    await connectedOwner("a");
    const ownerB = await connectedOwner("b");
    const x = withFakeX({ posts: () => postsReply([]) });

    await fetchOwnPosts(ownerB.workspaceId);

    expect(x.calls[0]?.url.pathname).toBe("/2/users/x-b/tweets");
    expect(x.calls[0]?.headers.get("authorization")).toBe("Bearer access-b");
  });

  it("does not call X when no account is connected", async () => {
    const owner = await createOwner("a");
    const x = withFakeX({});

    expect(await fetchOwnPosts(owner.workspaceId)).toEqual({ ok: false, error: "not_connected" });
    expect(x.calls).toHaveLength(0);
  });
});

describe("reply filtering", () => {
  it("drops comments (including replies to own posts) but keeps quotes", async () => {
    const owner = await connectedOwner();
    withFakeX({
      posts: () => ({
        status: 200,
        body: {
          data: [
            { id: "1", text: "original", created_at: "2026-09-20T10:00:00.000Z" },
            {
              id: "2",
              text: "https://t.co/link",
              created_at: "2026-09-20T10:01:00.000Z",
              in_reply_to_user_id: "x-a",
              referenced_tweets: [{ type: "replied_to", id: "1" }],
            },
            {
              id: "3",
              text: "reply without user id",
              created_at: "2026-09-20T10:02:00.000Z",
              referenced_tweets: [{ type: "replied_to", id: "1" }],
            },
            {
              id: "4",
              text: "quote",
              created_at: "2026-09-20T10:03:00.000Z",
              referenced_tweets: [{ type: "quoted", id: "99" }],
            },
          ],
          meta: { result_count: 4 },
        },
      }),
    });

    const result = await fetchOwnPosts(owner.workspaceId);

    expect(result.ok && result.data.posts.map((post) => post.id)).toEqual(["1", "4"]);
  });
});

describe("media previews", () => {
  it("maps photo and video previews and drops URLs outside X's media CDN", async () => {
    const owner = await connectedOwner();
    withFakeX({
      posts: () => ({
        status: 200,
        body: {
          data: [
            {
              id: "1",
              text: "photo",
              created_at: "2026-09-20T10:00:00.000Z",
              attachments: { media_keys: ["m1", "m2"] },
            },
            {
              id: "2",
              text: "video",
              created_at: "2026-09-19T10:00:00.000Z",
              attachments: { media_keys: ["m3"] },
            },
            {
              id: "3",
              text: "evil",
              created_at: "2026-09-18T10:00:00.000Z",
              attachments: { media_keys: ["m4"] },
            },
            { id: "4", text: "plain", created_at: "2026-09-17T10:00:00.000Z" },
          ],
          includes: {
            media: [
              { media_key: "m1", type: "photo", url: "https://pbs.twimg.com/media/a.jpg" },
              { media_key: "m2", type: "photo", url: "https://pbs.twimg.com/media/b.jpg" },
              {
                media_key: "m3",
                type: "video",
                preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/c.jpg",
              },
              { media_key: "m4", type: "photo", url: "https://evil.example/tracker.gif" },
            ],
          },
          meta: { result_count: 4 },
        },
      }),
    });

    const result = await fetchOwnPosts(owner.workspaceId);

    expect(result.ok && result.data.posts.map((post) => post.media)).toEqual([
      { type: "photo", previewUrl: "https://pbs.twimg.com/media/a.jpg", count: 2 },
      { type: "video", previewUrl: "https://pbs.twimg.com/ext_tw_video_thumb/c.jpg", count: 1 },
      { type: "photo", previewUrl: null, count: 1 },
      null,
    ]);
  });
});

describe("fetchPinnedPostId", () => {
  it("returns the pinned post id and records one user read", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ me: () => meReply("x-a", "a", "555") });

    expect(await fetchPinnedPostId(owner.workspaceId)).toEqual({ ok: true, data: "555" });
    expect(x.calls[0]?.url.searchParams.get("user.fields")).toBe("pinned_tweet_id");
    expect(await usageRows(owner.workspaceId)).toEqual([
      { operation: "userRead", units: 1, costMicros: 10_000n },
    ]);
  });

  it("returns null when nothing is pinned", async () => {
    const owner = await connectedOwner();
    withFakeX({ me: () => meReply("x-a") });

    expect(await fetchPinnedPostId(owner.workspaceId)).toEqual({ ok: true, data: null });
  });
});

describe("repostPost", () => {
  it("reposts the given post and records the write cost", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ repost: () => repostReply(true) });

    expect(await repostPost(owner.workspaceId, "101")).toEqual({ ok: true, data: "reposted" });
    expect(x.calls[0]?.method).toBe("POST");
    expect(x.calls[0]?.url.pathname).toBe("/2/users/x-a/retweets");
    expect(x.calls[0]?.json).toEqual({ tweet_id: "101" });
    expect(await usageRows(owner.workspaceId)).toEqual([
      { operation: "repost", units: 1, costMicros: 15_000n },
    ]);
  });

  it("treats 'already reposted' as the desired state", async () => {
    const owner = await connectedOwner();
    withFakeX({
      repost: () => ({ status: 403, body: { detail: "You have already retweeted this Post." } }),
    });

    expect(await repostPost(owner.workspaceId, "101")).toEqual({
      ok: true,
      data: "already_reposted",
    });
  });

  it.each([
    ["a timeout", () => "network-error" as const],
    ["a 5xx", () => ({ status: 503, body: {} })],
    ["a 200 that did not repost", () => repostReply(false)],
  ])("reports an unknown outcome after %s and still counts the cost", async (_label, reply) => {
    const owner = await connectedOwner();
    withFakeX({ repost: reply });

    expect(await repostPost(owner.workspaceId, "101")).toEqual({
      ok: false,
      error: "unknown_outcome",
    });
    expect(await usageRows(owner.workspaceId)).toEqual([
      { operation: "repost", units: 1, costMicros: 15_000n },
    ]);
  });

  it.each([
    [404, "not_found"],
    [402, "no_credits"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps HTTP %i to %s without recording cost", async (status, error) => {
    const owner = await connectedOwner();
    withFakeX({ repost: () => ({ status, body: { detail: "nope" } }) });

    expect(await repostPost(owner.workspaceId, "101")).toEqual({ ok: false, error });
    expect(await usageRows(owner.workspaceId)).toEqual([]);
  });

  it("marks the account for reconnect when X rejects the token", async () => {
    const owner = await connectedOwner();
    withFakeX({ repost: () => ({ status: 401, body: { title: "Unauthorized" } }) });

    expect(await repostPost(owner.workspaceId, "101")).toEqual({
      ok: false,
      error: "needs_reconnect",
    });
    const account = await prisma.xAccount.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(account.status).toBe("NEEDS_RECONNECT");

    // Subsequent calls stop before reaching X.
    const x = withFakeX({});
    expect(await repostPost(owner.workspaceId, "101")).toEqual({
      ok: false,
      error: "needs_reconnect",
    });
    expect(x.calls).toHaveLength(0);
  });
});

describe("undoRepostPost", () => {
  it("removes the Repost and records the deletion cost", async () => {
    const owner = await connectedOwner();
    const x = withFakeX({ undoRepost: () => repostReply(false) });

    expect(await undoRepostPost(owner.workspaceId, "101")).toEqual({ ok: true, data: "undone" });
    expect(x.calls[0]?.method).toBe("DELETE");
    expect(x.calls[0]?.url.pathname).toBe("/2/users/x-a/retweets/101");
    expect(await usageRows(owner.workspaceId)).toEqual([
      { operation: "undoRepost", units: 1, costMicros: 10_000n },
    ]);
  });

  it("reports an unknown outcome on timeout", async () => {
    const owner = await connectedOwner();
    withFakeX({ undoRepost: () => "network-error" });

    expect(await undoRepostPost(owner.workspaceId, "101")).toEqual({
      ok: false,
      error: "unknown_outcome",
    });
  });
});
