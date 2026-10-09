import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  changeCreatorStatus,
  creatorHistory,
  draftMessages,
  messagesToday,
  bulkCandidates,
  recordSentMessage,
  saveMessageLimit,
  sendBulkViaApi,
  sendMessageViaApi,
  undoOpenedMessage,
} from "@/server/services/outreach";
import { connectXDirectly, createOwner, resetDatabase } from "../helpers/db";
import { claudeReply, dmReply, fakeX } from "../helpers/fake-x";

let restoreFetch: (() => void) | undefined;
beforeEach(resetDatabase);
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-09T10:00:00Z"); // 12:00 Madrid

async function setup(suffix: "a" | "b" = "b", status: "NEW" | "PARTNER" = "NEW") {
  const owner = await createOwner(suffix);
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
  const target = await prisma.targetAccount.create({
    data: {
      workspaceId: owner.workspaceId,
      xUserId: `x-${suffix}`,
      username: `creator_${suffix}`,
      name: "Creator",
      bio: "gym & travel",
      lookedUpAt: NOW,
      status,
    },
  });
  return { workspace, target };
}

describe("recordSentMessage", () => {
  it("validates, records the confirmed message and moves the creator to Messaged", async () => {
    const { workspace, target } = await setup();

    expect(await recordSentMessage(workspace, { targetId: target.id, text: "  " }, NOW)).toEqual({
      ok: false,
      error: "empty_text",
    });
    expect(
      await recordSentMessage(workspace, { targetId: target.id, text: "x".repeat(1_001) }, NOW),
    ).toEqual({ ok: false, error: "too_long" });
    expect(
      await recordSentMessage(
        workspace,
        { targetId: target.id, text: "hi", postUrl: "https://example.com/1" },
        NOW,
      ),
    ).toEqual({
      ok: false,
      error: "invalid_post_url",
    });

    const result = await recordSentMessage(
      workspace,
      { targetId: target.id, text: "Hey! Support each other?", postUrl: "x.com/me/status/42?s=46" },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const updated = await prisma.targetAccount.findUniqueOrThrow({ where: { id: target.id } });
    expect([updated.status, updated.lastContactAt]).toEqual(["CONTACTED", NOW]);
    const [event] = await creatorHistory(workspace.id, target.id);
    expect(event).toMatchObject({
      kind: "MESSAGE_OPENED",
      postUrl: "https://x.com/me/status/42",
      status: "NEW",
    });
  });

  it("keeps partners as partners", async () => {
    const { workspace, target } = await setup("b", "PARTNER");
    await recordSentMessage(workspace, { targetId: target.id, text: "hi" }, NOW);
    expect(
      (await prisma.targetAccount.findUniqueOrThrow({ where: { id: target.id } })).status,
    ).toBe("PARTNER");
  });

  it("enforces the daily limit; undo restores the status and frees a slot", async () => {
    const { workspace, target } = await setup();
    const limited = { ...workspace, limitMessagesPerDay: 2 };

    const first = await recordSentMessage(limited, { targetId: target.id, text: "one" }, NOW);
    await recordSentMessage(limited, { targetId: target.id, text: "two" }, NOW);
    expect(await recordSentMessage(limited, { targetId: target.id, text: "three" }, NOW)).toEqual({
      ok: false,
      error: "daily_limit",
    });
    expect(await messagesToday(limited, NOW)).toEqual({ used: 2, limit: 2 });

    if (!first.ok) throw new Error("first message failed");
    expect(await undoOpenedMessage(workspace.id, first.data.eventId, NOW)).toEqual({
      ok: true,
      data: null,
    });
    expect(await messagesToday(limited, NOW)).toEqual({ used: 1, limit: 2 });
    expect(await undoOpenedMessage(workspace.id, first.data.eventId, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect((await creatorHistory(workspace.id, target.id)).map((event) => event.text)).toEqual([
      "two",
    ]);

    // Next local day (Madrid) → counter resets.
    expect(await messagesToday(limited, new Date("2026-10-09T22:30:00Z"))).toEqual({
      used: 0,
      limit: 2,
    });
  });

  it("undo is limited to 24 hours", async () => {
    const { workspace, target } = await setup();
    const opened = await recordSentMessage(workspace, { targetId: target.id, text: "hi" }, NOW);
    if (!opened.ok) throw new Error("open failed");
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await undoOpenedMessage(workspace.id, opened.data.eventId, later)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("status changes and isolation", () => {
  it("records manual status changes in the history", async () => {
    const { workspace, target } = await setup();
    expect(await changeCreatorStatus(workspace.id, target.id, "PARTNER", NOW)).toEqual({
      ok: true,
      data: null,
    });
    expect(await changeCreatorStatus(workspace.id, target.id, "NOPE", NOW)).toEqual({
      ok: false,
      error: "invalid_status",
    });
    const [event] = await creatorHistory(workspace.id, target.id);
    expect(event).toMatchObject({ kind: "STATUS_CHANGED", status: "PARTNER" });
  });

  it("never lets another workspace message, undo, re-status or read history of a creator", async () => {
    const victim = await setup("a");
    const opened = await recordSentMessage(
      victim.workspace,
      { targetId: victim.target.id, text: "hi" },
      NOW,
    );
    if (!opened.ok) throw new Error("open failed");
    const attacker = await setup("b");

    expect(
      await recordSentMessage(attacker.workspace, { targetId: victim.target.id, text: "x" }, NOW),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await undoOpenedMessage(attacker.workspace.id, opened.data.eventId, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await changeCreatorStatus(attacker.workspace.id, victim.target.id, "DECLINED", NOW),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await creatorHistory(attacker.workspace.id, victim.target.id)).toEqual([]);
    expect(
      (await prisma.targetAccount.findUniqueOrThrow({ where: { id: victim.target.id } })).status,
    ).toBe("CONTACTED");
  });
});

describe("draftMessages", () => {
  it("asks the AI with untrusted data in tags, records usage and caps drafts per creator for users", async () => {
    const { workspace, target } = await setup("b");
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { limitAiIdeasPerTargetDay: 1 },
    });
    const fake = fakeX({ anthropic: () => claudeReply({ messages: ["Hey!", "Hi there", "Yo"] }) });
    restoreFetch = fake.restore;

    const result = await draftMessages(
      workspace,
      { targetId: target.id, postUrl: "https://x.com/me/status/7" },
      NOW,
    );

    expect(result).toEqual({ ok: true, data: ["Hey!", "Hi there", "Yo"] });
    const body = fake.calls.find((call) => call.url.hostname === "api.anthropic.com")?.json as {
      system: string;
      messages: { content: string }[];
    };
    expect(body.system).toContain("untrusted data");
    expect(body.messages[0]?.content).toContain("<recipient_bio>gym & travel</recipient_bio>");
    expect(body.messages[0]?.content).toContain("<post_link>https://x.com/me/status/7</post_link>");
    expect(await prisma.externalUsage.count({ where: { operation: "aiCollabMessages" } })).toBe(1);

    expect(await draftMessages(workspace, { targetId: target.id }, NOW)).toEqual({
      ok: false,
      error: "ai_target_limit",
    });
  });

  it("rejects invalid model output", async () => {
    const { workspace, target } = await setup("a");
    const fake = fakeX({ anthropic: () => claudeReply({ messages: [] }) });
    restoreFetch = fake.restore;
    expect(await draftMessages(workspace, { targetId: target.id }, NOW)).toEqual({
      ok: false,
      error: "ai_unavailable",
    });
  });
});

describe("sendMessageViaApi", () => {
  it("sends one message to the creator, records it and its cost", async () => {
    const { workspace, target } = await setup();
    await connectXDirectly(workspace.id, { xUserId: "me-b", accessToken: "t-b" });
    const sent: { to: string; text: string }[] = [];
    const x = fakeX({ dm: (to, text) => (sent.push({ to, text }), dmReply()) });
    restoreFetch = x.restore;

    const result = await sendMessageViaApi(
      workspace,
      { targetId: target.id, text: " Hi! ", postUrl: "https://x.com/me/status/77" },
      NOW,
    );

    expect(result.ok).toBe(true);
    expect(sent).toEqual([{ to: "x-b", text: "Hi!" }]);
    expect(x.calls[0]?.headers.get("authorization")).toBe("Bearer t-b");
    const row = await prisma.targetAccount.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.status).toBe("CONTACTED");
    expect((await messagesToday(workspace, NOW)).used).toBe(1);
    const usage = await prisma.externalUsage.findMany({ where: { workspaceId: workspace.id } });
    expect(usage.map((item) => item.operation)).toEqual(["dmSend"]);
  });

  it("records nothing when X refuses, and never calls X past the daily limit", async () => {
    const { workspace, target } = await setup();
    await connectXDirectly(workspace.id, { xUserId: "me-b", accessToken: "t-b" });
    let calls = 0;
    const x = fakeX({
      dm: () => (
        calls++,
        { status: 403, body: { detail: "You cannot send messages to this user." } }
      ),
    });
    restoreFetch = x.restore;

    expect(await sendMessageViaApi(workspace, { targetId: target.id, text: "hi" }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await messagesToday(workspace, NOW)).used).toBe(0);
    expect(await creatorHistory(workspace.id, target.id)).toEqual([]);

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { limitMessagesPerDay: 0 },
    });
    expect(
      await sendMessageViaApi(
        { ...workspace, limitMessagesPerDay: 0 },
        { targetId: target.id, text: "hi" },
        NOW,
      ),
    ).toEqual({ ok: false, error: "daily_limit" });
    expect(calls).toBe(1);
  });

  it("never sends to another workspace's creator", async () => {
    const { target } = await setup("a");
    const { workspace } = await setup("b");
    await connectXDirectly(workspace.id, { xUserId: "me-b", accessToken: "t-b" });
    let calls = 0;
    const x = fakeX({ dm: () => (calls++, dmReply()) });
    restoreFetch = x.restore;

    expect(await sendMessageViaApi(workspace, { targetId: target.id, text: "hi" }, NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(calls).toBe(0);
  });
});

describe("bulk messages via the X API (D-035)", () => {
  async function bulkSetup() {
    const owner = await createOwner("b");
    await connectXDirectly(owner.workspaceId, { xUserId: "me-b", accessToken: "t-b" });
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    const make = (n: number, data: { status?: "NEW" | "DECLINED"; lastContactAt?: Date } = {}) =>
      prisma.targetAccount.create({
        data: {
          workspaceId: owner.workspaceId,
          xUserId: `x-${n}`,
          username: `creator_${n}`,
          name: `Creator ${n}`,
          lookedUpAt: NOW,
          ...data,
        },
      });
    const c1 = await make(1);
    const c2 = await make(2);
    const fresh = [c1, c2, await make(3)];
    const declined = await make(4, { status: "DECLINED" });
    const recent = await make(5, { lastContactAt: new Date(NOW.getTime() - 2 * 86_400_000) });
    const old = await make(6, { lastContactAt: new Date(NOW.getTime() - 8 * 86_400_000) });
    return { workspace, c1, c2, fresh, declined, recent, old };
  }

  it("splits selected creators into ready and skipped", async () => {
    const { workspace, fresh, declined, recent, old } = await bulkSetup();
    const ids = [...fresh, declined, recent, old].map((creator) => creator.id);
    const result = await bulkCandidates(workspace.id, ids, NOW);
    expect(result.ready.map((creator) => creator.username).sort()).toEqual([
      "creator_1",
      "creator_2",
      "creator_3",
      "creator_6",
    ]);
    expect(result.skipped.map((item) => [item.creator.username, item.reason]).sort()).toEqual([
      ["creator_4", "declined"],
      ["creator_5", "recently_messaged"],
    ]);
  });

  it("sends each text with the post link, skips ineligible creators and records each", async () => {
    const { workspace, c1, c2, declined } = await bulkSetup();
    const sent: { to: string; text: string }[] = [];
    const x = fakeX({ dm: (to, text) => (sent.push({ to, text }), dmReply()) });
    restoreFetch = x.restore;

    const result = await sendBulkViaApi(
      workspace,
      {
        items: [
          { targetId: c1.id, text: "Hi one" },
          { targetId: declined.id, text: "Hi declined" },
          { targetId: c2.id, text: "Hi two https://x.com/me/status/77" },
          { targetId: c2.id, text: "duplicate" },
        ],
        postUrl: "https://x.com/me/status/77",
      },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      data: [
        { targetId: c1.id, ok: true },
        { targetId: declined.id, ok: false, error: "declined" },
        { targetId: c2.id, ok: true },
      ],
    });
    expect(sent).toEqual([
      { to: "x-1", text: "Hi one\nhttps://x.com/me/status/77" },
      { to: "x-2", text: "Hi two https://x.com/me/status/77" },
    ]);
    expect((await messagesToday(workspace, NOW)).used).toBe(2);
  });

  it("stops at a rate limit: nothing after it is sent or retried", async () => {
    const { workspace, fresh } = await bulkSetup();
    let calls = 0;
    const x = fakeX({
      dm: () => (++calls === 2 ? { status: 429, body: { title: "Too Many Requests" } } : dmReply()),
    });
    restoreFetch = x.restore;

    const result = await sendBulkViaApi(
      workspace,
      { items: fresh.map((creator) => ({ targetId: creator.id, text: "hi" })) },
      NOW,
    );

    expect(result.ok && result.data.map((item) => (item.ok ? "ok" : item.error))).toEqual([
      "ok",
      "rate_limited",
      "not_sent",
    ]);
    expect(calls).toBe(2);
  });

  it("stops after 3 refusals in a row (X limiting messages to strangers)", async () => {
    const { workspace, fresh, old } = await bulkSetup();
    const extra = await prisma.targetAccount.create({
      data: {
        workspaceId: workspace.id,
        xUserId: "x-7",
        username: "creator_7",
        name: "Creator 7",
        lookedUpAt: NOW,
      },
    });
    let calls = 0;
    const x = fakeX({
      dm: () => (
        calls++,
        { status: 403, body: { detail: "You cannot send messages to this user." } }
      ),
    });
    restoreFetch = x.restore;

    const result = await sendBulkViaApi(
      workspace,
      { items: [...fresh, old, extra].map((creator) => ({ targetId: creator.id, text: "hi" })) },
      NOW,
    );

    expect(result.ok && result.data.map((item) => (item.ok ? "ok" : item.error))).toEqual([
      "forbidden",
      "forbidden",
      "forbidden",
      "x_refusing",
      "x_refusing",
    ]);
    expect(calls).toBe(3);
  });

  it("refuses more than 10 and never messages another workspace's creators", async () => {
    const { workspace } = await bulkSetup();
    const other = await setup("a");
    let calls = 0;
    const x = fakeX({ dm: () => (calls++, dmReply()) });
    restoreFetch = x.restore;

    const many = Array.from({ length: 11 }, (_, n) => ({
      targetId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      text: "hi",
    }));
    expect(await sendBulkViaApi(workspace, { items: many }, NOW)).toEqual({
      ok: false,
      error: "too_many",
    });
    expect(
      await sendBulkViaApi(workspace, { items: [{ targetId: other.target.id, text: "hi" }] }, NOW),
    ).toEqual({ ok: true, data: [{ targetId: other.target.id, ok: false, error: "not_found" }] });
    expect((await bulkCandidates(workspace.id, [other.target.id], NOW)).ready).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("saveMessageLimit", () => {
  it("accepts only the listed limits and applies them to the daily count", async () => {
    const { workspace } = await setup();
    expect(await saveMessageLimit(workspace.id, 51)).toEqual({ ok: false, error: "invalid_limit" });
    expect(await saveMessageLimit(workspace.id, 50)).toEqual({ ok: true, data: null });
    const updated = await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect((await messagesToday(updated, NOW)).limit).toBe(50);
  });
});
