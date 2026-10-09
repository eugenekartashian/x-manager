import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  addTemplate,
  getSessionData,
  loadTargetPosts,
  openReply,
  removeTemplate,
  saveReplyLimits,
  undoReply,
} from "@/server/services/replies";
import { addTargets, listTargets } from "@/server/services/targets";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { fakeX, postsReply, usersByReply } from "../helpers/fake-x";

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

const T0 = new Date("2026-10-01T10:00:00Z"); // 12:00 Madrid
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

async function workspaceWithTargets(suffix: "a" | "b" = "a", handles = ["alex", "gio"]) {
  const owner = await createOwner(suffix);
  await connectXDirectly(owner.workspaceId, {
    xUserId: `me-${suffix}`,
    accessToken: `t-${suffix}`,
  });
  withFakeX({
    usersBy: usersByReply(
      Object.fromEntries(handles.map((h, i) => [h, { id: `${suffix}-u${i}` }])),
    ),
  });
  await addTargets(owner.workspaceId, handles.join("\n"), T0);
  const targets = await listTargets(owner.workspaceId, "recent");
  const byName = Object.fromEntries(targets.map((target) => [target.username, target]));
  const workspace = {
    id: owner.workspaceId,
    timezone: "Europe/Madrid",
    replyCooldownHours: 24,
    replyDailyLimit: 15,
  };
  return { workspace, byName };
}

async function loadPosts(workspaceId: string, targetId: string, ids: string[], now = T0) {
  withFakeX({ posts: () => postsReply(ids) });
  return loadTargetPosts(workspaceId, targetId, now);
}

describe("templates", () => {
  it("validates, limits and isolates templates", async () => {
    const a = await workspaceWithTargets("a");
    const b = await workspaceWithTargets("b");

    expect(await addTemplate(a.workspace.id, "   ")).toEqual({ ok: false, error: "empty_text" });
    expect(await addTemplate(a.workspace.id, "x".repeat(281))).toEqual({
      ok: false,
      error: "too_long",
    });
    expect(await addTemplate(a.workspace.id, " Fire 🔥 ")).toEqual({ ok: true, data: null });

    const template = await prisma.replyTemplate.findFirstOrThrow({
      where: { workspaceId: a.workspace.id },
    });
    expect(template.text).toBe("Fire 🔥");
    expect(await removeTemplate(b.workspace.id, template.id)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await removeTemplate(a.workspace.id, template.id)).toEqual({ ok: true, data: null });
  });
});

describe("loading a target's posts", () => {
  it("fetches the latest posts, bills them as Post reads and throttles reloads", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const target = byName.alex;
    if (!target) throw new Error("setup");

    const x = withFakeX({ posts: () => postsReply(["p3", "p2", "p1"]) });
    expect(await loadTargetPosts(workspace.id, target.id, T0)).toEqual({
      ok: true,
      data: { loaded: 3 },
    });
    expect(x.calls[0]?.url.pathname).toBe(`/2/users/${target.xUserId}/tweets`);
    expect(x.calls[0]?.url.searchParams.get("max_results")).toBe("10");

    const usage = await prisma.externalUsage.findFirstOrThrow({
      where: { workspaceId: workspace.id, operation: "postRead" },
    });
    expect([usage.billedUnits, usage.costMicros]).toEqual([3, 15_000n]);

    expect(await loadPosts(workspace.id, target.id, ["p9"], hours(0.1))).toEqual({
      ok: false,
      error: "too_soon",
    });
    expect(await loadPosts(workspace.id, target.id, ["p9"], hours(1))).toEqual({
      ok: true,
      data: { loaded: 1 },
    });
    const session = await getSessionData(workspace, target.id, hours(1));
    expect(session?.posts.map((post) => post.xPostId)).toEqual(["p9"]);
  });
});

describe("creators who mostly repost", () => {
  it("pages past empty pages (≤ 5) until it finds originals, billing only returned posts", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const target = byName.alex;
    if (!target) throw new Error("setup");
    const pages: Record<string, ReturnType<typeof postsReply>> = {
      first: postsReply([], "t2"),
      t2: postsReply([], "t3"),
      t3: postsReply(["p7", "p6"], "t4"),
      t4: postsReply(["p5", "p4", "p3"], "t5"),
    };
    const x = withFakeX({
      posts: (url) => pages[url.searchParams.get("pagination_token") ?? "first"] ?? postsReply([]),
    });

    expect(await loadTargetPosts(workspace.id, target.id, T0)).toEqual({
      ok: true,
      data: { loaded: 5 },
    });
    expect(x.calls.map((call) => call.url.searchParams.get("pagination_token"))).toEqual([
      null,
      "t2",
      "t3",
      "t4",
    ]);
    const usage = await prisma.externalUsage.findFirstOrThrow({
      where: { workspaceId: workspace.id, operation: "postRead" },
    });
    expect(usage.billedUnits).toBe(5);
  });

  it("stops after 5 pages even if nothing is found", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const target = byName.alex;
    if (!target) throw new Error("setup");
    const x = withFakeX({ posts: () => postsReply([], "more") });
    expect(await loadTargetPosts(workspace.id, target.id, T0)).toEqual({
      ok: true,
      data: { loaded: 0 },
    });
    expect(x.calls).toHaveLength(5);
  });
});

describe("loading keeps the latest original posts", () => {
  it("shows at most 5 of the fetched posts", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const target = byName.alex;
    if (!target) throw new Error("setup");

    expect(await loadPosts(workspace.id, target.id, ["7", "6", "5", "4", "3", "2", "1"])).toEqual({
      ok: true,
      data: { loaded: 5 },
    });
    const session = await getSessionData(workspace, target.id, T0);
    expect(session?.posts.map((post) => post.xPostId)).toEqual(["7", "6", "5", "4", "3"]);
  });
});

describe("reply limits settings", () => {
  it("accepts only the offered options and applies them", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const alex = byName.alex;
    if (!alex) throw new Error("setup");

    expect(await saveReplyLimits(workspace.id, { cooldownHours: 1, perDay: 15 })).toEqual({
      ok: false,
      error: "invalid_limits",
    });
    expect(await saveReplyLimits(workspace.id, { cooldownHours: 6, perDay: 500 })).toEqual({
      ok: false,
      error: "invalid_limits",
    });
    expect(await saveReplyLimits(workspace.id, { cooldownHours: 6, perDay: 20 })).toEqual({
      ok: true,
      data: null,
    });

    const custom = { ...workspace, replyCooldownHours: 6, replyDailyLimit: 20 };
    await loadPosts(workspace.id, alex.id, ["p1", "p2"]);
    await openReply(custom, { targetId: alex.id, xPostId: "p1", text: "hi" }, T0);
    expect(
      await openReply(custom, { targetId: alex.id, xPostId: "p2", text: "hi" }, hours(5)),
    ).toEqual({
      ok: false,
      error: "account_cooldown",
    });
    expect(
      (await openReply(custom, { targetId: alex.id, xPostId: "p2", text: "hi" }, hours(6))).ok,
    ).toBe(true);
  });
});

describe("opening replies", () => {
  it("returns X's composer URL, logs the reply and marks the account", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const target = byName.alex;
    if (!target) throw new Error("setup");
    await loadPosts(workspace.id, target.id, ["p1"]);

    const result = await openReply(
      workspace,
      { targetId: target.id, xPostId: "p1", text: " Nice 🔥 " },
      T0,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const url = new URL(result.data.intentUrl);
      expect([url.searchParams.get("in_reply_to"), url.searchParams.get("text")]).toEqual([
        "p1",
        "Nice 🔥",
      ]);
    }
    const log = await prisma.replyLog.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    expect(log).toMatchObject({
      targetUsername: "alex",
      xPostId: "p1",
      text: "Nice 🔥",
      status: "OPENED",
    });
    expect(
      (await prisma.targetAccount.findUniqueOrThrow({ where: { id: target.id } })).lastRepliedAt,
    ).toEqual(T0);
  });

  it("allows one reply per account per 24 h", async () => {
    const { workspace, byName } = await workspaceWithTargets();
    const alex = byName.alex;
    const gio = byName.gio;
    if (!alex || !gio) throw new Error("setup");
    await loadPosts(workspace.id, alex.id, ["p1", "p2"]);
    await loadPosts(workspace.id, gio.id, ["g1"]);

    await openReply(workspace, { targetId: alex.id, xPostId: "p1", text: "hi" }, T0);

    expect(
      await openReply(workspace, { targetId: alex.id, xPostId: "p2", text: "hi" }, hours(23)),
    ).toEqual({
      ok: false,
      error: "account_cooldown",
    });
    expect(
      (await openReply(workspace, { targetId: gio.id, xPostId: "g1", text: "hi" }, hours(1))).ok,
    ).toBe(true);
    expect(
      (await openReply(workspace, { targetId: alex.id, xPostId: "p2", text: "hi" }, hours(24))).ok,
    ).toBe(true);
  });

  it("stops at 15 replies per local day and resets the next day", async () => {
    const handles = Array.from({ length: 17 }, (_, i) => `acc${i}`);
    const { workspace, byName } = await workspaceWithTargets("a", handles);
    for (const [i, handle] of handles.entries()) {
      const target = byName[handle];
      if (!target) throw new Error("setup");
      await loadPosts(workspace.id, target.id, [`post${i}`]);
    }

    const results = [];
    for (const [i, handle] of handles.slice(0, 16).entries()) {
      const target = byName[handle];
      results.push(
        await openReply(
          workspace,
          { targetId: target?.id ?? "", xPostId: `post${i}`, text: "hi" },
          hours(i * 0.1),
        ),
      );
    }
    expect(results.filter((result) => result.ok)).toHaveLength(15);
    expect(results[15]).toEqual({ ok: false, error: "daily_limit" });

    // Next Madrid day (00:30 local = 22:30Z).
    const nextDay = new Date("2026-10-01T22:30:00Z");
    expect(
      (
        await openReply(
          workspace,
          { targetId: byName.acc16?.id ?? "", xPostId: "post16", text: "hi" },
          nextDay,
        )
      ).ok,
    ).toBe(true);
  });

  it("only replies to loaded posts of the caller's own targets", async () => {
    const a = await workspaceWithTargets("a");
    const b = await workspaceWithTargets("b");
    const alexA = a.byName.alex;
    if (!alexA) throw new Error("setup");
    await loadPosts(a.workspace.id, alexA.id, ["p1"]);

    expect(
      await openReply(a.workspace, { targetId: alexA.id, xPostId: "999", text: "hi" }, T0),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await openReply(b.workspace, { targetId: alexA.id, xPostId: "p1", text: "hi" }, T0),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await openReply(a.workspace, { targetId: alexA.id, xPostId: "p1", text: "  " }, T0),
    ).toEqual({
      ok: false,
      error: "empty_text",
    });
    expect(await prisma.replyLog.count()).toBe(0);
  });

  it("undo frees the account and the daily slot, for the owner only", async () => {
    const a = await workspaceWithTargets("a");
    const b = await workspaceWithTargets("b");
    const alex = a.byName.alex;
    if (!alex) throw new Error("setup");
    await loadPosts(a.workspace.id, alex.id, ["p1", "p2"]);
    await openReply(a.workspace, { targetId: alex.id, xPostId: "p1", text: "hi" }, T0);
    const log = await prisma.replyLog.findFirstOrThrow({ where: { workspaceId: a.workspace.id } });

    expect(await undoReply(b.workspace.id, log.id, hours(0.1))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await undoReply(a.workspace.id, log.id, hours(0.1))).toEqual({ ok: true, data: null });

    const session = await getSessionData(a.workspace, alex.id, hours(0.2));
    expect(session).toMatchObject({ repliesToday: 0, block: null });
    expect(
      (await prisma.targetAccount.findUniqueOrThrow({ where: { id: alex.id } })).lastRepliedAt,
    ).toBeNull();
    expect(
      (await openReply(a.workspace, { targetId: alex.id, xPostId: "p2", text: "hi" }, hours(0.3)))
        .ok,
    ).toBe(true);
  });
});
