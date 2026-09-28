import { vi } from "vitest";

type Reply = { status: number; body: unknown } | "network-error";

export type FakeXCall = {
  method: string;
  url: URL;
  headers: Headers;
  body: URLSearchParams | null;
  json: unknown;
};

type Handlers = {
  token?: (params: URLSearchParams) => Reply | Promise<Reply>;
  me?: () => Reply;
  revoke?: () => Reply;
  posts?: (url: URL) => Reply;
  repost?: (postId: string) => Reply;
  undoRepost?: (postId: string) => Reply;
};

/**
 * Replaces global fetch with a scripted fake of the X endpoints used by the app.
 * Routes by method + path; every call is recorded for assertions.
 */
export function fakeX(handlers: Handlers) {
  const calls: FakeXCall[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    const json: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, url, headers: new Headers(init?.headers), body, json });

    const reply = await route(handlers, method, url, body, json);
    if (!reply) throw new Error(`Unexpected X call: ${method} ${url.pathname}`);
    if (reply === "network-error") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls, restore: () => spy.mockRestore() };
}

function route(
  h: Handlers,
  method: string,
  url: URL,
  body: URLSearchParams | null,
  json: unknown,
): Reply | Promise<Reply> | undefined {
  const path = url.pathname;
  if (path === "/2/oauth2/token") return h.token?.(body ?? new URLSearchParams());
  if (path === "/2/oauth2/revoke") return h.revoke?.();
  if (path === "/2/users/me") return h.me?.();
  if (/^\/2\/users\/[^/]+\/tweets$/.test(path)) return h.posts?.(url);
  if (method === "POST" && /^\/2\/users\/[^/]+\/retweets$/.test(path)) {
    return h.repost?.(String((json as { tweet_id?: string } | null)?.tweet_id));
  }
  const undo = /^\/2\/users\/[^/]+\/retweets\/([^/]+)$/.exec(path);
  if (method === "DELETE" && undo) return h.undoRepost?.(decodeURIComponent(undo[1] ?? ""));
  return undefined;
}

export const tokenReply = (
  suffix: string,
  scope = "tweet.read tweet.write users.read offline.access",
) => ({
  status: 200,
  body: {
    token_type: "bearer",
    access_token: `access-${suffix}`,
    refresh_token: `refresh-${suffix}`,
    expires_in: 7200,
    scope,
  },
});

export const meReply = (id = "x-user-1", username = "eugene", pinnedPostId?: string) => ({
  status: 200,
  body: {
    data: {
      id,
      username,
      name: "Eugene",
      ...(pinnedPostId ? { pinned_tweet_id: pinnedPostId } : {}),
    },
  },
});

export const postsReply = (ids: string[], nextToken?: string) => ({
  status: 200,
  body: {
    ...(ids.length
      ? {
          data: ids.map((id, index) => ({
            id,
            text: `Post ${id}`,
            created_at: new Date(Date.UTC(2026, 8, 20 - index)).toISOString(),
            public_metrics: {
              retweet_count: 1,
              reply_count: 2,
              like_count: 3,
              quote_count: 0,
              impression_count: 100,
            },
          })),
        }
      : {}),
    meta: { result_count: ids.length, ...(nextToken ? { next_token: nextToken } : {}) },
  },
});

export const repostReply = (retweeted: boolean) => ({ status: 200, body: { data: { retweeted } } });
