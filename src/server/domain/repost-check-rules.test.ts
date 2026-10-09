import { describe, expect, it } from "vitest";
import { isDailyCheckDue, mergeSeen, scanReposterPage, SEEN_CAP } from "./repost-check-rules";

const start = { fresh: [], knownRun: 0, stop: false };

describe("scanReposterPage", () => {
  it("collects new reposters and stops after 3 already-seen in a row", () => {
    const seen = new Set(["a", "b", "c", "d"]);
    expect(scanReposterPage(["n1", "n2", "a", "b", "c", "n3"], seen, start)).toEqual({
      fresh: ["n1", "n2"],
      knownRun: 3,
      stop: true,
    });
  });

  it("does not stop on a single old account that re-reposted", () => {
    const seen = new Set(["a", "b", "c"]);
    expect(scanReposterPage(["n1", "a", "n2", "n3"], seen, start)).toEqual({
      fresh: ["n1", "n2", "n3"],
      knownRun: 0,
      stop: false,
    });
  });

  it("carries the run of known accounts across pages", () => {
    const seen = new Set(["a", "b", "c"]);
    const first = scanReposterPage(["n1", "a", "b"], seen, start);
    expect(first.stop).toBe(false);
    expect(scanReposterPage(["c", "n9"], seen, first)).toEqual({
      fresh: ["n1"],
      knownRun: 3,
      stop: true,
    });
  });

  it("with nothing seen yet (first check) takes everything", () => {
    expect(scanReposterPage(["x", "y"], new Set(), start)).toEqual({
      fresh: ["x", "y"],
      knownRun: 0,
      stop: false,
    });
  });
});

describe("mergeSeen", () => {
  it("puts fresh first, de-duplicates and caps", () => {
    expect(mergeSeen(["n1", "a"], ["a", "b"])).toEqual(["n1", "a", "b"]);
    const many = Array.from({ length: SEEN_CAP + 10 }, (_, i) => `id${i}`);
    expect(mergeSeen(["new"], many)).toHaveLength(SEEN_CAP);
  });
});

describe("isDailyCheckDue (09:00 workspace time)", () => {
  const tz = "Europe/Madrid"; // UTC+2 in October
  it("is due after 09:00 local if not checked since", () => {
    expect(isDailyCheckDue(null, new Date("2026-10-10T07:05:00Z"), tz)).toBe(true); // 09:05
    expect(
      isDailyCheckDue(new Date("2026-10-09T07:10:00Z"), new Date("2026-10-10T07:05:00Z"), tz),
    ).toBe(true);
  });
  it("is not due before 09:00 or when already checked today", () => {
    expect(isDailyCheckDue(null, new Date("2026-10-10T06:55:00Z"), tz)).toBe(false); // 08:55
    expect(
      isDailyCheckDue(new Date("2026-10-10T07:01:00Z"), new Date("2026-10-10T15:00:00Z"), tz),
    ).toBe(false);
  });
});
