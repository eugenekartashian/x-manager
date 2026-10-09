import { describe, expect, it } from "vitest";
import { mergeSeen, scanReposterPage, SEEN_CAP } from "./repost-check-rules";

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
