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
  post?: (postId: string) => Reply;
  usersBy?: (usernames: string[]) => Reply;
  /** GET /2/tweets/:id/retweeted_by */
  repostedBy?: (postId: string, paginationToken: string | null, maxResults: number) => Reply;
  /** Fake Claude Messages API (api.anthropic.com/v1/messages). */
  anthropic?: (body: unknown) => Reply;
  /** Fake OpenAI Responses API (api.openai.com/v1/responses). */
  openai?: (body: unknown) => Reply;
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
  const reposted = /^\/2\/tweets\/(\d+)\/retweeted_by$/.exec(path);
  if (reposted)
    return h.repostedBy?.(
      reposted[1] ?? "",
      url.searchParams.get("pagination_token"),
      Number(url.searchParams.get("max_results") ?? "100"),
    );
  if (url.hostname === "api.anthropic.com")
    return path === "/v1/messages" ? h.anthropic?.(json) : undefined;
  if (url.hostname === "api.openai.com")
    return path === "/v1/responses" ? h.openai?.(json) : undefined;
  if (path === "/2/oauth2/token") return h.token?.(body ?? new URLSearchParams());
  if (path === "/2/oauth2/revoke") return h.revoke?.();
  if (path === "/2/users/me") return h.me?.();
  if (path === "/2/users/by")
    return h.usersBy?.((url.searchParams.get("usernames") ?? "").split(","));
  if (/^\/2\/users\/[^/]+\/tweets$/.test(path)) return h.posts?.(url);
  const single = /^\/2\/tweets\/([^/]+)$/.exec(path);
  if (single) return h.post?.(decodeURIComponent(single[1] ?? ""));
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

export const postReply = (
  id: string,
  authorId: string,
  createdAt = "2025-01-15T10:00:00.000Z",
) => ({
  status: 200,
  body: {
    data: {
      id,
      text: `Post ${id}`,
      author_id: authorId,
      created_at: createdAt,
      public_metrics: { retweet_count: 5, reply_count: 1, like_count: 50, quote_count: 0 },
    },
  },
});

/** Fake /2/users/by: returns a profile for each known handle (case-insensitive). */
export const usersByReply =
  (known: Record<string, { id: string; followers?: number }>) => (usernames: string[]) => ({
    status: 200,
    body: {
      data: usernames
        .map((name) => {
          const entry = Object.entries(known).find(
            ([handle]) => handle.toLowerCase() === name.toLowerCase(),
          );
          return entry
            ? {
                id: entry[1].id,
                username: entry[0],
                name: `Name ${entry[0]}`,
                description: `bio of ${entry[0]}`,
                profile_image_url: `https://pbs.twimg.com/profile_images/${entry[1].id}.jpg`,
                public_metrics: {
                  followers_count: entry[1].followers ?? 100,
                  following_count: 10,
                  tweet_count: 50,
                },
              }
            : null;
        })
        .filter(Boolean),
    },
  });

/** A Claude Messages API reply carrying the given JSON text. */
export const claudeReply = (
  payload: unknown,
  options: { stopReason?: string; model?: string; input?: number; output?: number } = {},
) => ({
  status: 200,
  body: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: options.model ?? "claude-opus-5",
    content:
      options.stopReason === "refusal" ? [] : [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: options.stopReason ?? "end_turn",
    stop_sequence: null,
    usage: { input_tokens: options.input ?? 400, output_tokens: options.output ?? 120 },
  },
});

/** An OpenAI Responses API reply carrying the given JSON text (or a refusal). */
export const openAiReply = (payload: unknown, options: { refusal?: boolean } = {}) => ({
  status: 200,
  body: {
    id: "resp_test",
    object: "response",
    created_at: 1_790_000_000,
    status: "completed",
    model: "gpt-5-mini-2025-08-07",
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: options.refusal
          ? [{ type: "refusal", refusal: "I can't help with that." }]
          : [{ type: "output_text", text: JSON.stringify(payload), annotations: [] }],
      },
    ],
    usage: { input_tokens: 500, output_tokens: 300, total_tokens: 800 },
  },
});

/** A page of reposters, newest first; `next` becomes meta.next_token. */
export const repostedByReply = (users: string[], next?: string) => ({
  status: 200,
  body: {
    data: users.map((id) => ({ id, username: `u${id}`, name: `User ${id}` })),
    meta: { result_count: users.length, ...(next ? { next_token: next } : {}) },
  },
});
