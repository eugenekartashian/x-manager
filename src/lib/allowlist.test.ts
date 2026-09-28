import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowlist } from "./allowlist";

describe("parseAllowlist", () => {
  it("splits, trims, lowercases and drops empty entries", () => {
    expect(parseAllowlist(" Me@Gmail.com, ,friend@example.com ,")).toEqual([
      "me@gmail.com",
      "friend@example.com",
    ]);
  });

  it("returns an empty list for an empty string", () => {
    expect(parseAllowlist("")).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  const allowlist = ["me@gmail.com"];

  it("allows a listed email regardless of case and whitespace", () => {
    expect(isEmailAllowed("  ME@gmail.COM ", allowlist)).toBe(true);
  });

  it("rejects an unlisted email", () => {
    expect(isEmailAllowed("stranger@gmail.com", allowlist)).toBe(false);
  });

  it("rejects a lookalike with a different domain", () => {
    expect(isEmailAllowed("me@gmail.com.evil.io", allowlist)).toBe(false);
  });
});
