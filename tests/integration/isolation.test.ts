import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { suggestIdeasForPost } from "@/server/services/ai-replies";
import { getHistoryPageData } from "@/server/services/history";
import {
  getSessionData,
  loadTargetPosts,
  openReply,
  removeTemplate,
  undoReply,
} from "@/server/services/replies";
import {
  exportTargetsCsv,
  listTargets,
  removeTarget,
  saveTargetNote,
} from "@/server/services/targets";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { claudeReply, fakeX, postsReply, usersByReply } from "../helpers/fake-x";

// Cross-workspace isolation audit (M6.4): user B passes user A's ids to every service that
// takes an id from the request. Each call must behave as "not found" and change nothing.

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

const T0 = new Date("2026-10-01T10:00:00Z");

/** User A with a target, loaded posts, a template, an opened reply and some spend. */
async function victim() {
  const a = await createOwner("a");
  await connectXDirectly(a.workspaceId, { xUserId: "me-a", accessToken: "t-a" });
  const target = await prisma.targetAccount.create({
    data: {
      workspaceId: a.workspaceId,
      xUserId: "alex-id",
      username: "alex",
      name: "Alex",
      lookedUpAt: T0,
      note: "secret note",
    },
  });
  await prisma.targetPost.create({
    data: {
      workspaceId: a.workspaceId,
      targetId: target.id,
      xPostId: "111",
      text: "post",
      postedAt: T0,
      fetchedAt: T0,
    },
  });
  const template = await prisma.replyTemplate.create({
    data: { workspaceId: a.workspaceId, text: "hi" },
  });
  const reply = await prisma.replyLog.create({
    data: {
      workspaceId: a.workspaceId,
      targetId: target.id,
      targetUsername: "alex",
      xPostId: "111",
      text: "hi",
      openedAt: T0,
    },
  });
  await prisma.externalUsage.create({
    data: {
      workspaceId: a.workspaceId,
      provider: "X",
      operation: "repost",
      units: 1,
      costMicros: 15_000n,
      occurredAt: T0,
    },
  });
  return { a, target, template, reply };
}

async function attacker() {
  const b = await createOwner("b");
  await connectXDirectly(b.workspaceId, { xUserId: "me-b", accessToken: "t-b" });
  return b;
}

const bWorkspace = (workspaceId: string) => ({
  id: workspaceId,
  timezone: "Europe/Madrid",
  replyCooldownHours: 24,
  replyDailyLimit: 15,
});

describe("cross-workspace isolation", () => {
  it("targets: B cannot list, export, annotate or remove A's targets", async () => {
    const { target } = await victim();
    const b = await attacker();

    expect(await listTargets(b.workspaceId, "recent")).toEqual([]);
    expect(await exportTargetsCsv(b.workspaceId, "UTC")).not.toContain("alex");
    expect(await saveTargetNote(b.workspaceId, target.id, "pwned")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await removeTarget(b.workspaceId, target.id)).toEqual({
      ok: false,
      error: "not_found",
    });
    const after = await prisma.targetAccount.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.note).toBe("secret note");
  });

  it("replies: B cannot open A's session, load, reply to or undo A's replies", async () => {
    const { target, template, reply } = await victim();
    const b = await attacker();
    const x = withFakeX({ posts: () => postsReply(["999"]) });

    expect(await getSessionData(bWorkspace(b.workspaceId), target.id, T0)).toBeNull();
    expect(await loadTargetPosts(b.workspaceId, target.id, T0)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await openReply(
        bWorkspace(b.workspaceId),
        { targetId: target.id, xPostId: "111", text: "x" },
        T0,
      ),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await undoReply(b.workspaceId, reply.id, T0)).toEqual({ ok: false, error: "not_found" });
    expect(await removeTemplate(b.workspaceId, template.id)).toEqual({
      ok: false,
      error: "not_found",
    });

    expect(x.calls).toHaveLength(0); // nothing was fetched on A's behalf or with B's token
    expect(await prisma.replyLog.count({ where: { workspaceId: b.workspaceId } })).toBe(0);
    expect(
      (await prisma.replyLog.findUniqueOrThrow({ where: { id: reply.id } })).undoneAt,
    ).toBeNull();
    expect(await prisma.replyTemplate.count({ where: { id: template.id } })).toBe(1);
  });

  it("AI: B cannot get ideas for A's target post", async () => {
    const { target } = await victim();
    const b = await attacker();
    const x = withFakeX({ anthropic: () => claudeReply({ ideas: ["x"] }) });

    expect(
      await suggestIdeasForPost(b.workspaceId, { targetId: target.id, xPostId: "111" }, T0),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(x.calls).toHaveLength(0);
  });

  it("history: B sees none of A's runs or spend", async () => {
    await victim();
    const b = await attacker();

    const history = await getHistoryPageData(b.workspaceId, "all", T0);

    expect(history.runs).toEqual([]);
    expect(history.budget.spentMicros).toBe(0n);
    expect(history.spend).toEqual([]);
  });

  it("targets lookups never reuse another workspace's X token", async () => {
    await victim();
    const b = await attacker();
    const x = withFakeX({ usersBy: usersByReply({ gio: { id: "gio-id" } }) });

    const { addTargets } = await import("@/server/services/targets");
    await addTargets(b.workspaceId, "gio", T0);

    const auth = x.calls.map((call) => call.headers.get("authorization"));
    expect(auth.length).toBeGreaterThan(0);
    expect(auth.every((header) => header === "Bearer t-b")).toBe(true);
  });
});
