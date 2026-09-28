import { vi } from "vitest";

type Reply = { status: number; body: unknown } | "network-error";

export type FakeXCall = {
  method: string;
  url: string;
  headers: Headers;
  body: URLSearchParams | null;
};

/**
 * Replaces global fetch with a scripted fake of the X endpoints used by the app.
 * Each handler returns the reply for one call; calls are recorded for assertions.
 */
export function fakeX(handlers: {
  token?: (params: URLSearchParams) => Reply | Promise<Reply>;
  me?: () => Reply;
  revoke?: () => Reply;
}) {
  const calls: FakeXCall[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    calls.push({ method: init?.method ?? "GET", url, headers: new Headers(init?.headers), body });

    const handler = url.endsWith("/2/oauth2/token")
      ? handlers.token && (() => handlers.token?.(body ?? new URLSearchParams()))
      : url.endsWith("/2/users/me")
        ? handlers.me
        : url.endsWith("/2/oauth2/revoke")
          ? handlers.revoke
          : undefined;
    if (!handler) throw new Error(`Unexpected X call: ${url}`);

    const reply = await handler();
    if (!reply) throw new Error(`No reply scripted for ${url}`);
    if (reply === "network-error") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls, restore: () => spy.mockRestore() };
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

export const meReply = (id = "x-user-1", username = "eugene") => ({
  status: 200,
  body: { data: { id, username, name: "Eugene" } },
});
