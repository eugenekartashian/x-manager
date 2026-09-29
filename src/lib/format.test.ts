import { describe, expect, it } from "vitest";
import { formatAge, formatCount, formatDateTime, formatUsd } from "./format";

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

describe("formatAge", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it.each([
    ["2026-10-01T11:59:30Z", "just now"],
    ["2026-10-01T11:35:00Z", "25 min ago"],
    ["2026-10-01T09:00:00Z", "3 h ago"],
    ["2026-09-30T12:00:00Z", "1 d ago"],
    ["2026-09-01T12:00:00Z", "30 d ago"],
    ["2026-10-01T12:05:00Z", "just now"], // clock skew: never negative
  ])("%s → %s", (iso, expected) => {
    expect(formatAge(new Date(iso), now)).toBe(expected);
  });
});
