import { describe, expect, it } from "vitest";
import { DEFAULT_REPLY_LIMITS, isFreshPost, replyBlock, replyIntentUrl } from "./reply-rules";

const limits = DEFAULT_REPLY_LIMITS;

const NOW = new Date("2026-10-01T12:00:00Z");

describe("replyBlock", () => {
  it("allows a first reply", () => {
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 0, limits, now: NOW })).toBeNull();
  });

  it("blocks a second reply to the same account within 24 h", () => {
    const last = new Date("2026-10-01T08:00:00Z");
    expect(replyBlock({ lastRepliedAt: last, repliesToday: 1, limits, now: NOW })).toEqual({
      reason: "account_cooldown",
      until: new Date("2026-10-02T08:00:00Z"),
    });
    expect(
      replyBlock({
        lastRepliedAt: new Date("2026-09-30T11:59:00Z"),
        repliesToday: 1,
        limits,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("uses the workspace's own limits", () => {
    const custom = { cooldownHours: 6, perDay: 20 };
    const last = new Date("2026-10-01T05:00:00Z");
    expect(
      replyBlock({ lastRepliedAt: last, repliesToday: 19, limits: custom, now: NOW }),
    ).toBeNull();
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 20, limits: custom, now: NOW })).toEqual(
      { reason: "daily_limit" },
    );
  });

  it("blocks after 15 replies in a day", () => {
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 15, limits, now: NOW })).toEqual({
      reason: "daily_limit",
    });
    expect(replyBlock({ lastRepliedAt: null, repliesToday: 14, limits, now: NOW })).toBeNull();
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

describe("isFreshPost", () => {
  it("is fresh under 24 h and old from 24 h", () => {
    expect(isFreshPost(new Date("2026-09-30T12:00:01Z"), NOW)).toBe(true);
    expect(isFreshPost(new Date("2026-09-30T12:00:00Z"), NOW)).toBe(false);
  });
});
