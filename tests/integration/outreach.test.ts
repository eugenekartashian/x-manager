import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  changeCreatorStatus,
  creatorHistory,
  draftMessages,
  messagesToday,
  recordSentMessage,
  undoOpenedMessage,
} from "@/server/services/outreach";
import { createOwner, resetDatabase } from "../helpers/db";
import { claudeReply, fakeX } from "../helpers/fake-x";

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
