import { describe, expect, it } from "vitest";
import {
  addDays,
  isLocalDate,
  isLocalTime,
  isTimeZone,
  localDateOf,
  zonedToUtc,
} from "./zoned-time";

const iso = (date: Date) => date.toISOString();

describe("zonedToUtc", () => {
  it.each([
    ["2026-09-28", "09:40", "Europe/Madrid", "2026-09-28T07:40:00.000Z"], // CEST +2
    ["2026-12-01", "09:40", "Europe/Madrid", "2026-12-01T08:40:00.000Z"], // CET +1
    ["2026-09-28", "09:40", "America/New_York", "2026-09-28T13:40:00.000Z"], // EDT -4
    ["2026-12-01", "09:40", "America/New_York", "2026-12-01T14:40:00.000Z"], // EST -5
    ["2026-09-28", "00:00", "Asia/Kolkata", "2026-09-27T18:30:00.000Z"], // +5:30
    ["2026-09-28", "23:59", "UTC", "2026-09-28T23:59:00.000Z"],
  ])("%s %s %s → %s", (date, time, zone, expected) => {
    expect(iso(zonedToUtc(date, time, zone))).toBe(expected);
  });

  it("moves a wall time skipped by spring-forward past the gap (Madrid 29 Mar 02:30 → 03:30)", () => {
    const result = zonedToUtc("2026-03-29", "02:30", "Europe/Madrid");
    expect(iso(result)).toBe("2026-03-29T01:30:00.000Z");
  });

  it("runs a repeated fall-back wall time once, at the earlier instant (Madrid 25 Oct 02:30)", () => {
    expect(iso(zonedToUtc("2026-10-25", "02:30", "Europe/Madrid"))).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("handles US transitions on their own dates (NY 8 Mar gap, 1 Nov overlap)", () => {
    expect(iso(zonedToUtc("2026-03-08", "02:30", "America/New_York"))).toBe(
      "2026-03-08T07:30:00.000Z",
    );
    expect(iso(zonedToUtc("2026-11-01", "01:30", "America/New_York"))).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("keeps the same wall time across a DST change", () => {
    const before = zonedToUtc("2026-10-24", "09:00", "Europe/Madrid");
    const after = zonedToUtc("2026-10-26", "09:00", "Europe/Madrid");
    expect(after.getTime() - before.getTime()).toBe(49 * 3_600_000);
  });
});

describe("helpers", () => {
  it("formats the local date in a timezone", () => {
    expect(localDateOf(new Date("2026-09-28T23:30:00Z"), "Europe/Madrid")).toBe("2026-09-29");
    expect(localDateOf(new Date("2026-09-28T23:30:00Z"), "America/New_York")).toBe("2026-09-28");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates inputs", () => {
    expect(isLocalTime("09:40")).toBe(true);
    expect(isLocalTime("24:00")).toBe(false);
    expect(isLocalTime("9:40")).toBe(false);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isTimeZone("Europe/Madrid")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
  });
});
