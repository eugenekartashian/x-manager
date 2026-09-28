import { describe, expect, it } from "vitest";
import { parsePostUrl } from "./post-url";

describe("parsePostUrl", () => {
  it.each([
    [
      "https://x.com/eugenebarcelona/status/1839000000000000001",
      "1839000000000000001",
      "eugenebarcelona",
    ],
    ["x.com/eugenebarcelona/status/123?s=20&t=abc", "123", "eugenebarcelona"],
    ["https://twitter.com/user/status/456/photo/1", "456", "user"],
    ["https://mobile.twitter.com/user/statuses/789", "789", "user"],
    ["https://x.com/i/status/321", "321", null],
    ["  1839000000000000001  ", "1839000000000000001", null],
  ])("parses %s", (input, postId, username) => {
    expect(parsePostUrl(input)).toEqual({ postId, username });
  });

  it.each([
    "",
    "hello",
    "https://evil.com/user/status/123",
    "https://x.com.evil.com/user/status/123",
    "https://x.com/user",
    "https://x.com/user/status/abc",
    "https://x.com/user/status/12345678901234567890",
    "javascript:alert(1)",
  ])("rejects %s", (input) => {
    expect(parsePostUrl(input)).toBeNull();
  });
});
