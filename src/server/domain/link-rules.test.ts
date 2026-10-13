import { describe, expect, it } from "vitest";
import { codeFromBytes, deviceOf, isBot, isValidCode, normaliseDestination } from "./link-rules";

describe("link codes", () => {
  it("are 6 characters from an unambiguous alphabet", () => {
    const code = codeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 255]));
    expect(code).toHaveLength(6);
    expect(isValidCode(code)).toBe(true);
    expect(isValidCode("abc0O1")).toBe(false);
    expect(isValidCode("abc")).toBe(false);
  });
});

describe("isBot / deviceOf", () => {
  it("does not count X previews, crawlers, scripts or missing user agents", () => {
    expect(isBot("Twitterbot/1.0")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(
      isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile"),
    ).toBe(false);
  });
  it("tells phones, tablets and desktops apart", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile")).toBe("phone");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 15) Mobile")).toBe("phone");
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 18_0)")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)")).toBe("desktop");
  });
});

describe("normaliseDestination", () => {
  const host = "x-manager-ek.vercel.app";
  it("accepts https links (adding https:// when missing)", () => {
    expect(normaliseDestination("onlyfans.com/me", host)).toBe("https://onlyfans.com/me");
    expect(normaliseDestination(" https://onlyfans.com/me?c=1 ", host)).toBe(
      "https://onlyfans.com/me?c=1",
    );
  });
  it("refuses other schemes, credentials, loops and junk", () => {
    expect(normaliseDestination("http://onlyfans.com/me", host)).toBeNull();
    expect(normaliseDestination("javascript:alert(1)", host)).toBeNull();
    expect(normaliseDestination("https://user:pw@evil.com", host)).toBeNull();
    expect(normaliseDestination(`https://${host}/l/abcdef`, host)).toBeNull();
    expect(normaliseDestination("not a link", host)).toBeNull();
    expect(normaliseDestination("", host)).toBeNull();
  });
});
