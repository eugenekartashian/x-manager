import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  addSuggestions,
  findSimilar,
  listSuggestions,
  skipSuggestions,
} from "@/server/services/discovery";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX } from "../helpers/fake-x";

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

const user = (id: string, followers: number, connection?: string[]) => ({
  id,
  username: `u${id}`,
  name: `User ${id}`,
  description: `bio ${id}`,
  public_metrics: { followers_count: followers, following_count: 1, tweet_count: 1 },
  ...(connection ? { connection_status: connection } : {}),
});
const page = (users: ReturnType<typeof user>[], nextToken?: string) => ({
  status: 200,
  body: {
    data: users,
    meta: { result_count: users.length, ...(nextToken ? { next_token: nextToken } : {}) },
  },
});

async function setup(suffix: "a" | "b" = "a") {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `me-${suffix}`,
    accessToken: `t-${suffix}`,
  });
  const source = await prisma.targetAccount.create({
    data: {
      workspaceId: owner.workspaceId,
      xUserId: `src-${suffix}`,
      username: `source_${suffix}`,
      name: "Source",
      lookedUpAt: NOW,
    },
  });
  return { workspaceId: owner.workspaceId, source };
}

describe("findSimilar", () => {
  it("reads one page of who a creator follows, suggests only new 10K+ accounts", async () => {
    const { workspaceId, source } = await setup();
    await prisma.targetAccount.create({
      data: { workspaceId, xUserId: "2", username: "u2", name: "Known", lookedUpAt: NOW },
    });
    const x = withFakeX({
      following: () =>
        page(
          [
            user("1", 50_000, ["followed_by"]),
            user("2", 80_000), // already a creator
            user("3", 9_999), // too small
            user("me-a", 99_000), // the owner themselves
          ],
          "next-1",
        ),
    });

    expect(await findSimilar(workspaceId, source.id, NOW)).toEqual({
      ok: true,
      data: { read: 4, suggested: 1, alreadyKnown: 1, tooSmall: 1, finished: false },
    });
    expect(x.calls[0]?.url.pathname).toBe("/2/users/src-a/following");
    expect(x.calls[0]?.url.searchParams.get("max_results")).toBe("100");
    expect(x.calls[0]?.url.searchParams.get("user.fields")).toContain("connection_status");

    const suggestions = await listSuggestions(workspaceId);
    expect(suggestions.map((item) => [item.username, item.via, item.followsYou])).toEqual([
      ["u1", "source_a", true],
    ]);
    // Every returned user is billed ($0.010).
    const usage = await prisma.externalUsage.findFirstOrThrow({ where: { workspaceId } });
    expect([usage.operation, usage.units, usage.costMicros]).toEqual(["followingRead", 4, 40_000n]);
  });

  it("continues where the last run stopped and stops at the end of the list", async () => {
    const { workspaceId, source } = await setup();
    const x = withFakeX({
      following: (url) =>
        url.searchParams.get("pagination_token") === "next-1"
          ? page([user("5", 20_000)])
          : page([user("4", 20_000)], "next-1"),
    });
    await findSimilar(workspaceId, source.id, NOW);
    const second = await findSimilar(workspaceId, source.id, NOW);
    expect(second.ok && second.data.finished).toBe(true);
    expect(x.calls.map((call) => call.url.searchParams.get("pagination_token"))).toEqual([
      null,
      "next-1",
    ]);
    expect(await findSimilar(workspaceId, source.id, NOW)).toEqual({
      ok: false,
      error: "nothing_left",
    });
    expect(x.calls).toHaveLength(2);
  });

  it("never suggests a skipped account again", async () => {
    const { workspaceId, source } = await setup();
    withFakeX({ following: () => page([user("1", 50_000)], "more") });
    await findSimilar(workspaceId, source.id, NOW);
    const [first] = await listSuggestions(workspaceId);
    expect(await skipSuggestions(workspaceId, [first?.id ?? ""])).toEqual({
      ok: true,
      data: { skipped: 1 },
    });
    const again = await findSimilar(workspaceId, source.id, NOW);
    expect(again.ok && again.data.suggested).toBe(0);
    expect(await listSuggestions(workspaceId)).toEqual([]);
  });
});

describe("adding suggestions", () => {
  it("adds them as creators without calling X, and only the workspace's own", async () => {
    const a = await setup("a");
    const b = await setup("b");
    withFakeX({ following: () => page([user("1", 50_000), user("6", 70_000)]) });
    await findSimilar(a.workspaceId, a.source.id, NOW);
    const suggestions = await listSuggestions(a.workspaceId);
    const ids = suggestions.map((item) => item.id);

    const x = withFakeX({});
    expect(await addSuggestions(b.workspaceId, ids, NOW)).toEqual({
      ok: false,
      error: "invalid_selection",
    });
    expect(await addSuggestions(a.workspaceId, ids, NOW)).toEqual({ ok: true, data: { added: 2 } });
    expect(x.calls).toHaveLength(0);

    const added = await prisma.targetAccount.findMany({
      where: { workspaceId: a.workspaceId, source: "DISCOVERY" },
      orderBy: { username: "asc" },
    });
    expect(added.map((row) => [row.username, row.followersCount])).toEqual([
      ["u1", 50_000],
      ["u6", 70_000],
    ]);
    expect(await listSuggestions(a.workspaceId)).toEqual([]);
    expect(await prisma.targetAccount.count({ where: { workspaceId: b.workspaceId } })).toBe(1);
  });
});
