import { describe, expect, it } from "vitest";
import { dmIntentUrl, statusAfterMessage } from "./outreach-rules";

describe("dmIntentUrl", () => {
  it("prefills the recipient and encoded text", () => {
    const url = new URL(
      dmIntentUrl("123", "Hi! Let's collab 🔥 https://x.com/me/status/1?s=1&t=2"),
    );
    expect(url.origin + url.pathname).toBe("https://x.com/messages/compose");
    expect(url.searchParams.get("recipient_id")).toBe("123");
    expect(url.searchParams.get("text")).toBe(
      "Hi! Let's collab 🔥 https://x.com/me/status/1?s=1&t=2",
    );
  });
});

describe("statusAfterMessage", () => {
  it.each([
    ["NEW", "CONTACTED"],
    ["NO_REPLY", "CONTACTED"],
    ["DECLINED", "CONTACTED"],
    ["REPOSTED", "REPOSTED"],
    ["PARTNER", "PARTNER"],
  ])("%s → %s", (from, to) => {
    expect(statusAfterMessage(from)).toBe(to);
  });
});
