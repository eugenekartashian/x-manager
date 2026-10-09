import { describe, expect, it } from "vitest";
import { chatUrl, statusAfterMessage } from "./outreach-rules";

describe("chatUrl", () => {
  it("links the 1:1 X chat with both ids, lower first (as numbers, not strings)", () => {
    expect(chatUrl("1754401461281161216", "1068127814061342724")).toBe(
      "https://x.com/i/chat/1068127814061342724-1754401461281161216",
    );
    expect(chatUrl("1068127814061342724", "1754401461281161216")).toBe(
      "https://x.com/i/chat/1068127814061342724-1754401461281161216",
    );
    // "999" < "1000" as numbers even though it sorts after it as text.
    expect(chatUrl("1000", "999")).toBe("https://x.com/i/chat/999-1000");
  });

  it("falls back to the compose link when our X account is not connected", () => {
    expect(chatUrl(null, "123")).toBe("https://x.com/messages/compose?recipient_id=123");
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
