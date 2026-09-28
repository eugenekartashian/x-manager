import { describe, expect, it } from "vitest";
import { replyBlock, replyIntentUrl } from "./reply-rules";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("replyBlock", () => {
  it("allows a first reply", () => {
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 0, now: NOW })).toBeNull();
  });

  it("blocks a second reply to the same account within 24 h", () => {
    const last = new Date("2026-10-01T08:00:00Z");
    expect(replyBlock({ lastRepliedAt: last, repliesToday: 1, now: NOW })).toEqual({
      reason: "account_cooldown",
      until: new Date("2026-10-02T08:00:00Z"),
    });
    expect(
      replyBlock({ lastRepliedAt: new Date("2026-09-30T11:59:00Z"), repliesToday: 1, now: NOW }),
    ).toBeNull();
  });

  it("blocks after 15 replies in a day", () => {
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 15, now: NOW })).toEqual({
      reason: "daily_limit",
    });
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 14, now: NOW })).toBeNull();
  });
});

describe("replyIntentUrl", () => {
  it("builds an encoded x.com composer link for the reply", () => {
    const url = new URL(replyIntentUrl("123", "Hot 🔥 & bold #gym"));
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("in_reply_to")).toBe("123");
    expect(url.searchParams.get("text")).toBe("Hot 🔥 & bold #gym");
  });
});
