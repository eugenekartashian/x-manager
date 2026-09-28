import { describe, expect, it } from "vitest";
import { formatCount, formatDateTime, formatUsd } from "./format";

describe("formatUsd", () => {
  it.each([
    [0n, "$0.00"],
    [10_000n, "$0.01"],
    [1_000n, "$0.001"],
    [35_000n, "$0.035"],
    [5_000_000n, "$5.00"],
    [4_500_000n, "$4.50"],
  ])("formats %s micros as %s", (micros, expected) => {
    expect(formatUsd(micros)).toBe(expected);
  });
});

describe("formatDateTime", () => {
  it("renders in the workspace timezone", () => {
    expect(formatDateTime(new Date("2026-09-28T07:00:00Z"), "Europe/Madrid")).toBe(
      "28 Sept, 09:00",
    );
  });
});

describe("formatCount", () => {
  it("shows unavailable metrics as a dash, not zero", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12_300)).toBe("12K");
  });
});
