import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  completeXConnection,
  disconnectX,
  getXAccessToken,
  OAUTH_STATE_TTL_MS,
  startXConnection,
  type ConnectionOwner,
} from "@/server/services/x-connection";
import { createOwner, resetDatabase } from "../helpers/db";
import { fakeX, meReply, tokenReply } from "../helpers/fake-x";

let restoreFetch: (() => void) | undefined;
function useFakeX(...args: Parameters<typeof fakeX>) {
  const fake = fakeX(...args);
  restoreFetch = fake.restore;
  return fake;
}

beforeEach(resetDatabase);
afterEach(() => restoreFetch?.());
afterAll(() => prisma.$disconnect());

function stateFrom(authorizeUrl: string): string {
  return new URL(authorizeUrl).searchParams.get("state") ?? "";
}

async function connect(owner: ConnectionOwner, now = new Date()) {
  const { authorizeUrl, sealedState } = startXConnection(owner, now);
  return completeXConnection(
    owner,
    { code: "code-1", state: stateFrom(authorizeUrl) },
    sealedState,
    now,
  );
}

describe("startXConnection", () => {
  it("builds an S256 PKCE authorize URL with minimal scopes", async () => {
    const owner = await createOwner("a");
    const { authorizeUrl, sealedState } = startXConnection(owner);
    const url = new URL(authorizeUrl);

    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "test-x-client-id",
      redirect_uri: "http://127.0.0.1:3000/api/x/oauth/callback",
      scope: "tweet.read tweet.write users.read offline.access",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("state")?.length).toBeGreaterThanOrEqual(43);
    expect(sealedState).not.toContain(url.searchParams.get("state"));
  });
});

describe("completeXConnection", () => {
  it("connects, stores tokens encrypted and records the users/me cost", async () => {
    const owner = await createOwner("a");
    const x = useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    const { authorizeUrl, sealedState } = startXConnection(owner);

    const result = await completeXConnection(
      owner,
      { code: "code-1", state: stateFrom(authorizeUrl) },
      sealedState,
    );

    expect(result).toMatchObject({ ok: true, data: { username: "eugene", status: "CONNECTED" } });

    // Token exchange: Basic client auth + a verifier matching the published challenge.
    const tokenCall = x.calls.find((call) => call.url.pathname === "/2/oauth2/token");
    expect(tokenCall?.headers.get("authorization")).toMatch(/^Basic /);
    const verifier = tokenCall?.body?.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(new URL(authorizeUrl).searchParams.get("code_challenge"));

    const row = await prisma.xAccount.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.accessTokenEnc).not.toContain("access-1");
    expect(row.refreshTokenEnc).not.toContain("refresh-1");
    expect(await getXAccessToken(owner.workspaceId)).toEqual({ ok: true, data: "access-1" });

    const usage = await prisma.externalUsage.findMany({
      where: { workspaceId: owner.workspaceId },
    });
    expect(usage).toMatchObject([{ operation: "users.me", units: 1, costMicros: 10_000n }]);
  });

  it("reports a cancelled authorization without calling X", async () => {
    const owner = await createOwner("a");
    const x = useFakeX({});
    const { sealedState } = startXConnection(owner);

    const result = await completeXConnection(owner, { error: "access_denied" }, sealedState);

    expect(result).toEqual({ ok: false, error: "denied" });
    expect(x.calls).toHaveLength(0);
  });

  it.each([
    ["a mismatched state", (state: string, sealed: string) => ({ state: `${state}x`, sealed })],
    ["a missing cookie", (state: string) => ({ state, sealed: undefined })],
    ["a tampered cookie", (state: string, sealed: string) => ({ state, sealed: `${sealed}x` })],
  ])("rejects %s without calling X", async (_label, mutate) => {
    const owner = await createOwner("a");
    const x = useFakeX({});
    const { authorizeUrl, sealedState } = startXConnection(owner);
    const { state, sealed } = mutate(stateFrom(authorizeUrl), sealedState);

    const result = await completeXConnection(owner, { code: "code-1", state }, sealed);

    expect(result).toEqual({ ok: false, error: "invalid_state" });
    expect(x.calls).toHaveLength(0);
  });

  it("rejects an expired attempt", async () => {
    const owner = await createOwner("a");
    useFakeX({});
    const started = new Date("2026-09-28T10:00:00Z");
    const { authorizeUrl, sealedState } = startXConnection(owner, started);
    const later = new Date(started.getTime() + OAUTH_STATE_TTL_MS + 1);

    const result = await completeXConnection(
      owner,
      { code: "code-1", state: stateFrom(authorizeUrl) },
      sealedState,
      later,
    );

    expect(result).toEqual({ ok: false, error: "expired" });
  });

  it("never attaches an X account to another user's workspace", async () => {
    const ownerA = await createOwner("a");
    const ownerB = await createOwner("b");
    const x = useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    // A starts the flow; B's session completes it with A's state cookie and code.
    const { authorizeUrl, sealedState } = startXConnection(ownerA);

    const result = await completeXConnection(
      ownerB,
      { code: "code-1", state: stateFrom(authorizeUrl) },
      sealedState,
    );

    expect(result).toEqual({ ok: false, error: "session_mismatch" });
    expect(x.calls).toHaveLength(0);
    expect(await prisma.xAccount.count()).toBe(0);
  });

  it("refuses an X account already linked to another workspace", async () => {
    const ownerA = await createOwner("a");
    const ownerB = await createOwner("b");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply("same-x-user") });

    expect((await connect(ownerA)).ok).toBe(true);
    const second = await connect(ownerB);

    expect(second).toEqual({ ok: false, error: "already_linked" });
    const rows = await prisma.xAccount.findMany();
    expect(rows.map((row) => row.workspaceId)).toEqual([ownerA.workspaceId]);
  });

  it("requires every requested scope", async () => {
    const owner = await createOwner("a");
    const x = useFakeX({ token: () => tokenReply("1", "tweet.read users.read offline.access") });

    const result = await connect(owner);

    expect(result).toEqual({ ok: false, error: "missing_scopes" });
    expect(x.calls.some((call) => call.url.pathname === "/2/users/me")).toBe(false);
    expect(await prisma.xAccount.count()).toBe(0);
  });

  it("explains exhausted credits (HTTP 402)", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => ({ status: 402, body: {} }) });

    expect(await connect(owner)).toEqual({ ok: false, error: "no_credits" });
  });

  it("maps a network failure to a retryable error", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => "network-error" });

    expect(await connect(owner)).toEqual({ ok: false, error: "x_unavailable" });
  });
});

describe("getXAccessToken", () => {
  const connectedAt = new Date("2026-09-28T10:00:00Z");
  const nearExpiry = new Date(connectedAt.getTime() + 7200_000 - 60_000);

  it("returns the stored token without calling X while it is fresh", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner, connectedAt);
    const x = useFakeX({});

    expect(await getXAccessToken(owner.workspaceId, connectedAt)).toEqual({
      ok: true,
      data: "access-1",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("refreshes near expiry and stores the rotated refresh token", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner, connectedAt);
    const x = useFakeX({ token: () => tokenReply("2") });

    expect(await getXAccessToken(owner.workspaceId, nearExpiry)).toEqual({
      ok: true,
      data: "access-2",
    });
    expect(x.calls[0]?.body?.get("refresh_token")).toBe("refresh-1");

    // Next refresh must use the rotated token.
    const later = new Date(nearExpiry.getTime() + 7200_000);
    const x2 = useFakeX({ token: () => tokenReply("3") });
    await getXAccessToken(owner.workspaceId, later);
    expect(x2.calls[0]?.body?.get("refresh_token")).toBe("refresh-2");
  });

  it("refreshes only once when two workers ask concurrently", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner, connectedAt);
    const x = useFakeX({
      token: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return tokenReply("2");
      },
    });

    const results = await Promise.all([
      getXAccessToken(owner.workspaceId, nearExpiry),
      getXAccessToken(owner.workspaceId, nearExpiry),
    ]);

    expect(results).toEqual([
      { ok: true, data: "access-2" },
      { ok: true, data: "access-2" },
    ]);
    expect(x.calls.filter((call) => call.url.pathname === "/2/oauth2/token")).toHaveLength(1);
  });

  it("marks the account for reconnect when X rejects the refresh token", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner, connectedAt);
    useFakeX({ token: () => ({ status: 400, body: { error: "invalid_grant" } }) });

    expect(await getXAccessToken(owner.workspaceId, nearExpiry)).toEqual({
      ok: false,
      error: "needs_reconnect",
    });
    const row = await prisma.xAccount.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe("NEEDS_RECONNECT");
  });

  it("keeps the account connected when X is temporarily unavailable", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner, connectedAt);
    useFakeX({ token: () => ({ status: 503, body: {} }) });

    expect(await getXAccessToken(owner.workspaceId, nearExpiry)).toEqual({
      ok: false,
      error: "x_unavailable",
    });
    const row = await prisma.xAccount.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe("CONNECTED");
  });

  it("never returns another workspace's token", async () => {
    const ownerA = await createOwner("a");
    const ownerB = await createOwner("b");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(ownerA);

    expect(await getXAccessToken(ownerB.workspaceId)).toEqual({
      ok: false,
      error: "not_connected",
    });
  });
});

describe("disconnectX", () => {
  it("deletes the connection and revokes the refresh token at X", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner);
    const x = useFakeX({ revoke: () => ({ status: 200, body: { revoked: true } }) });

    await disconnectX(owner.workspaceId);

    expect(await prisma.xAccount.count()).toBe(0);
    expect(x.calls[0]?.body?.get("token")).toBe("refresh-1");
  });

  it("still deletes locally when revocation fails", async () => {
    const owner = await createOwner("a");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply() });
    await connect(owner);
    useFakeX({ revoke: () => "network-error" });

    await disconnectX(owner.workspaceId);

    expect(await prisma.xAccount.count()).toBe(0);
  });

  it("only affects the caller's workspace", async () => {
    const ownerA = await createOwner("a");
    const ownerB = await createOwner("b");
    useFakeX({ token: () => tokenReply("1"), me: () => meReply("x-a") });
    await connect(ownerA);
    const x = useFakeX({});

    await disconnectX(ownerB.workspaceId);

    expect(await prisma.xAccount.count()).toBe(1);
    expect(x.calls).toHaveLength(0);
  });

  it("lets the same X account be connected again afterwards", async () => {
    const ownerA = await createOwner("a");
    const ownerB = await createOwner("b");
    useFakeX({
      token: () => tokenReply("1"),
      me: () => meReply("same-x-user"),
      revoke: () => ({ status: 200, body: { revoked: true } }),
    });
    await connect(ownerA);
    await disconnectX(ownerA.workspaceId);

    expect((await connect(ownerB)).ok).toBe(true);
  });
});
