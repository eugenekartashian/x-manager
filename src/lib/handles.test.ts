import { describe, expect, it } from "vitest";
import { parseHandles } from "./handles";

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
