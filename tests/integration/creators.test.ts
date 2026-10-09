import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  listCreators,
  normalizeTag,
  parseCreatorFilters,
  removeCreators,
  setCreatorRole,
  setCreatorStatus,
  tagCreators,
} from "@/server/services/creators";
import { addTargets, refreshCreators } from "@/server/services/targets";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, usersByReply } from "../helpers/fake-x";

let restoreFetch: (() => void) | undefined;
beforeEach(resetDatabase);
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-09T10:00:00Z");

async function seed(
  workspaceId: string,
  rows: { username: string; followers: number; status?: "NEW" | "CONTACTED"; tags?: string[] }[],
) {
  const created = [];
  for (const [index, row] of rows.entries()) {
    created.push(
      await prisma.targetAccount.create({
        data: {
          workspaceId,
          xUserId: `${workspaceId}-${row.username}`,
          username: row.username,
          name: row.username.toUpperCase(),
          followersCount: row.followers,
          lookedUpAt: NOW,
          status: row.status ?? "NEW",
          tags: row.tags ?? [],
          createdAt: new Date(NOW.getTime() + index * 1000),
        },
      }),
    );
  }
  return created;
}

const filters = (params: Record<string, string> = {}) => parseCreatorFilters(params);

describe("parseCreatorFilters", () => {
  it("accepts valid values and falls back on bad ones", () => {
    expect(
      parseCreatorFilters({
        status: "CONTACTED",
        q: " @alex ",
        tag: "gym",
        sort: "recent",
        page: "2",
      }),
    ).toEqual({
      status: "CONTACTED",
      q: "@alex",
      tag: "gym",
      sort: "recent",
      page: 2,
      owed: false,
    });
    expect(parseCreatorFilters({ status: "HACK", sort: "drop table", page: "-5" })).toEqual({
      status: undefined,
      q: undefined,
      tag: undefined,
      sort: "followers",
      page: 1,
      owed: false,
    });
  });
});

describe("listCreators", () => {
  it("filters by status, tag and search; sorts; counts per status; pages of 25", async () => {
    const owner = await createOwner("a");
    await seed(owner.workspaceId, [
      { username: "alex", followers: 100, status: "CONTACTED", tags: ["gym"] },
      { username: "gio", followers: 900, tags: ["gym", "collab"] },
      { username: "max", followers: 50 },
    ]);

    const all = await listCreators(owner.workspaceId, filters());
    expect(all.rows.map((row) => row.username)).toEqual(["gio", "alex", "max"]);
    expect(all.counts).toEqual({ NEW: 2, CONTACTED: 1 });
    expect(all.tags).toEqual(["collab", "gym"]);
    expect(all.pages).toBe(1);

    expect(
      (await listCreators(owner.workspaceId, filters({ status: "CONTACTED" }))).rows.map(
        (r) => r.username,
      ),
    ).toEqual(["alex"]);
    expect((await listCreators(owner.workspaceId, filters({ tag: "gym" }))).total).toBe(2);
    expect(
      (await listCreators(owner.workspaceId, filters({ q: "@GI" }))).rows.map((r) => r.username),
    ).toEqual(["gio"]);
    expect(
      (await listCreators(owner.workspaceId, filters({ sort: "recent" }))).rows[0]?.username,
    ).toBe("max");

    await seed(
      owner.workspaceId,
      Array.from({ length: 25 }, (_, i) => ({ username: `bulk${i}`, followers: i })),
    );
    const page2 = await listCreators(owner.workspaceId, filters({ page: "2" }));
    expect(page2.pages).toBe(2);
    expect(page2.rows).toHaveLength(3);
  });
});

describe("bulk edits", () => {
  it("sets status (stamping last contact), adds/removes normalised tags and removes rows", async () => {
    const owner = await createOwner("a");
    const [alex, gio] = await seed(owner.workspaceId, [
      { username: "alex", followers: 1 },
      { username: "gio", followers: 2, tags: ["gym"] },
    ]);
    const ids = [alex?.id ?? "", gio?.id ?? ""];

    expect(await setCreatorStatus(owner.workspaceId, ids, "CONTACTED", NOW)).toEqual({
      ok: true,
      data: { updated: 2 },
    });
    expect(await setCreatorStatus(owner.workspaceId, ids, "BOGUS", NOW)).toEqual({
      ok: false,
      error: "invalid_status",
    });
    expect(await tagCreators(owner.workspaceId, ids, " #Gym ", "add")).toEqual({
      ok: true,
      data: { tag: "gym" },
    });
    expect(await tagCreators(owner.workspaceId, ids, "bad tag!!", "add")).toEqual({
      ok: false,
      error: "invalid_tag",
    });

    const rows = await prisma.targetAccount.findMany({ orderBy: { username: "asc" } });
    expect(rows.map((row) => [row.status, row.tags, row.lastContactAt])).toEqual([
      ["CONTACTED", ["gym"], NOW],
      ["CONTACTED", ["gym"], NOW], // no duplicate tag
    ]);

    await tagCreators(owner.workspaceId, [gio?.id ?? ""], "gym", "remove");
    expect(
      (await prisma.targetAccount.findUniqueOrThrow({ where: { id: gio?.id ?? "" } })).tags,
    ).toEqual([]);

    expect(await removeCreators(owner.workspaceId, [alex?.id ?? ""])).toEqual({
      ok: true,
      data: { removed: 1 },
    });
    expect(await prisma.targetAccount.count()).toBe(1);
    expect(await removeCreators(owner.workspaceId, [])).toEqual({
      ok: false,
      error: "invalid_selection",
    });
  });

  it("never touches another workspace's creators", async () => {
    const a = await createOwner("a");
    const b = await createOwner("b");
    const [victim] = await seed(a.workspaceId, [{ username: "alex", followers: 1, tags: ["x"] }]);
    const ids = [victim?.id ?? ""];

    expect(await setCreatorStatus(b.workspaceId, ids, "DECLINED", NOW)).toEqual({
      ok: true,
      data: { updated: 0 },
    });
    await tagCreators(b.workspaceId, ids, "pwned", "add");
    await tagCreators(b.workspaceId, ids, "x", "remove");
    expect(await removeCreators(b.workspaceId, ids)).toEqual({ ok: true, data: { removed: 0 } });
    expect((await listCreators(b.workspaceId, filters())).rows).toEqual([]);

    const row = await prisma.targetAccount.findUniqueOrThrow({ where: { id: victim?.id ?? "" } });
    expect([row.status, row.tags]).toEqual(["NEW", ["x"]]);
  });
});

describe("source of added creators", () => {
  it("records how a creator was added", async () => {
    const owner = await createOwner("a");
    await connectXDirectly(owner.workspaceId, { xUserId: "me", accessToken: "t" });
    const fake = fakeX({ usersBy: usersByReply({ alex: { id: "1" }, gio: { id: "2" } }) });
    restoreFetch = fake.restore;

    await addTargets(owner.workspaceId, "alex", NOW, "IMPORT");
    await addTargets(owner.workspaceId, "gio", NOW, "SHARE");

    const rows = await prisma.targetAccount.findMany({ orderBy: { username: "asc" } });
    expect(rows.map((row) => [row.username, row.source])).toEqual([
      ["alex", "IMPORT"],
      ["gio", "SHARE"],
    ]);
  });
});

describe("normalizeTag", () => {
  it.each([
    ["Gym", "gym"],
    ["#Collab", "collab"],
    ["two words", "two-words"],
    ["кириллица", "кириллица"],
    ["", null],
    ["x".repeat(25), null],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });
});

describe("roles", () => {
  it("sets, filters and clears a role; refuses bad values and other workspaces", async () => {
    const owner = await createOwner("a");
    const other = await createOwner("b");
    const [alex, gio] = await seed(owner.workspaceId, [
      { username: "alex", followers: 1 },
      { username: "gio", followers: 2 },
    ]);

    expect(await setCreatorRole(owner.workspaceId, [alex?.id ?? ""], "BOTTOM")).toEqual({
      ok: true,
      data: { updated: 1 },
    });
    expect(await setCreatorRole(owner.workspaceId, [gio?.id ?? ""], "ALPHA")).toEqual({
      ok: false,
      error: "invalid_status",
    });
    expect(
      (await listCreators(owner.workspaceId, filters({ role: "BOTTOM" }))).rows.map(
        (row) => row.username,
      ),
    ).toEqual(["alex"]);
    expect(parseCreatorFilters({ role: "nonsense" }).role).toBeUndefined();

    expect(await setCreatorRole(other.workspaceId, [alex?.id ?? ""], "TOP")).toEqual({
      ok: true,
      data: { updated: 0 },
    });
    await setCreatorRole(owner.workspaceId, [alex?.id ?? ""], "");
    expect(
      (await prisma.targetAccount.findUniqueOrThrow({ where: { id: alex?.id ?? "" } })).role,
    ).toBeNull();
  });
});

describe("follows you (D-036)", () => {
  it("stores X's connection_status on add, filters by it and refreshes only own creators", async () => {
    const owner = await createOwner("a");
    const other = await createOwner("b");
    await connectXDirectly(owner.workspaceId, { xUserId: "me", accessToken: "t" });
    let known: Parameters<typeof usersByReply>[0] = {
      fan: { id: "1", connection: ["followed_by"] },
      friend: { id: "2", connection: ["followed_by", "following"] },
      stranger: { id: "3", connection: [] },
      old: { id: "4" },
    };
    const fake = fakeX({ usersBy: (names) => usersByReply(known)(names) });
    restoreFetch = fake.restore;
    await addTargets(owner.workspaceId, "fan friend stranger old", NOW);
    expect(fake.calls[0]?.url.searchParams.get("user.fields")).toContain("connection_status");

    const names = async (conn: string) =>
      (await listCreators(owner.workspaceId, parseCreatorFilters({ conn }))).rows
        .map((row) => row.username)
        .sort();
    expect(await names("follows")).toEqual(["fan", "friend"]);
    expect(await names("mutual")).toEqual(["friend"]);
    expect(await names("none")).toEqual(["stranger"]);
    expect(await names("unknown")).toEqual(["old"]);

    // Refresh: the stranger followed back; never creates rows, never touches other workspaces.
    const foreign = await seed(other.workspaceId, [{ username: "stranger", followers: 1 }]);
    known = { ...known, stranger: { id: "3", connection: ["followed_by"] } };
    const stranger = await prisma.targetAccount.findFirstOrThrow({
      where: { workspaceId: owner.workspaceId, username: "stranger" },
    });
    expect(await refreshCreators(owner.workspaceId, [stranger.id], NOW)).toEqual({
      ok: true,
      data: { refreshed: 1 },
    });
    expect(await names("follows")).toEqual(["fan", "friend", "stranger"]);
    expect(
      await refreshCreators(
        owner.workspaceId,
        foreign.map((row) => row.id),
        NOW,
      ),
    ).toEqual({
      ok: false,
      error: "invalid_selection",
    });
    const untouched = await prisma.targetAccount.findUniqueOrThrow({
      where: { id: foreign[0]?.id ?? "" },
    });
    expect(untouched.followsYou).toBeNull();
    expect(await prisma.targetAccount.count({ where: { workspaceId: owner.workspaceId } })).toBe(4);
  });
});
