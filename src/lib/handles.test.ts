import { describe, expect, it } from "vitest";
import { handleFromShared, parseHandles } from "./handles";

describe("parseHandles", () => {
  it("accepts handles with or without @, links, and Excel columns", () => {
    const input =
      "@alex__ink\ngiovanni33xxx, https://x.com/John_Gerk87\n\thttps://twitter.com/someone/  x.com/other?s=20";
    expect(parseHandles(input)).toEqual({
      handles: ["alex__ink", "giovanni33xxx", "John_Gerk87", "someone", "other"],
      invalid: [],
    });
  });

  it("deduplicates case-insensitively, keeping the first spelling", () => {
    expect(parseHandles("Alex @alex ALEX").handles).toEqual(["Alex"]);
  });

  it("reports invalid entries", () => {
    expect(
      parseHandles("ok_name way_too_long_handle_123 bad-char https://evil.com/x").invalid,
    ).toEqual(["way_too_long_handle_123", "bad-char", "https://evil.com/x"]);
  });

  it("ignores empty input", () => {
    expect(parseHandles("  \n ,, ")).toEqual({ handles: [], invalid: [] });
  });
});

describe("handleFromShared", () => {
  it.each([
    ["https://x.com/alex__ink", "alex__ink"],
    ["https://x.com/alex__ink?s=21&t=abc", "alex__ink"],
    ["https://x.com/alex__ink/status/1834567890123456789?s=46", "alex__ink"],
    ["Look at this https://twitter.com/Gio_33/status/1 🔥", "Gio_33"],
    ["https://mobile.x.com/someone/", "someone"],
    ["Alex Ink (@alex__ink) on X", "alex__ink"],
  ])("%s → %s", (input, expected) => {
    expect(handleFromShared(input)).toBe(expected);
  });

  it.each([
    "https://x.com/i/status/1834567890123456789",
    "https://x.com/search?q=gym",
    "https://example.com/alex",
    "nothing here",
    "",
  ])("finds no username in %s", (input) => {
    expect(handleFromShared(input)).toBeNull();
  });

  it("combines the url, text and title fields of a share", () => {
    expect(handleFromShared(null, "Great post", "https://x.com/gio/status/5")).toBe("gio");
  });
});
