import { describe, expect, it } from "vitest";
import { planReposts, type PlanInput, type PlanSlot } from "./repost-plan";

const H = 3_600_000;

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    schedule: { active: true, startDate: "2026-10-01", durationDays: null },
    slots: [],
    list: [
      { id: "A", lastRepostedAt: null },
      { id: "B", lastRepostedAt: null },
      { id: "C", lastRepostedAt: null },
    ],
    limits: { minIntervalMs: 4 * H, dailyCap: 8 },
    workspaceTimezone: "Europe/Madrid",
    from: new Date("2026-10-01T00:00:00Z"),
    to: new Date("2026-10-02T00:00:00Z"),
    ...overrides,
  };
}

const slot = (id: string, localTime: string, timezone = "UTC"): PlanSlot => ({
  id,
  localTime,
  timezone,
});

const summary = (plan: ReturnType<typeof planReposts>) =>
  plan.map(
    (item) =>
      `${item.runAt.toISOString().slice(11, 16)} ${item.postId ?? "-"}${item.skipReason ? ` (${item.skipReason})` : ""}`,
  );

describe("planReposts — whole list at every time", () => {
  it("reposts every post in the list, bottom to top, so the first ends on top", () => {
    const plan = planReposts(input({ slots: [slot("s", "10:00")] }));
    expect(summary(plan)).toEqual(["10:00 C", "10:00 B", "10:00 A"]);
    expect(plan.map((item) => item.key)).toEqual([
      "s:2026-10-01:C",
      "s:2026-10-01:B",
      "s:2026-10-01:A",
    ]);
    expect(new Set(plan.map((item) => item.batchKey))).toEqual(new Set(["s:2026-10-01"]));
  });

  it("repeats the whole list at each daily time (EU + US)", () => {
    const plan = planReposts(
      input({
        list: [
          { id: "A", lastRepostedAt: null },
          { id: "B", lastRepostedAt: null },
        ],
        slots: [slot("eu", "10:00", "Europe/Madrid"), slot("us", "10:00", "America/New_York")],
      }),
    );
    // 10:00 Madrid = 08:00Z, 10:00 NY = 14:00Z (6 h apart ≥ 4 h interval).
    expect(summary(plan)).toEqual(["08:00 B", "08:00 A", "14:00 B", "14:00 A"]);
  });

  it("returns nothing when the schedule is off", () => {
    const plan = planReposts(
      input({
        schedule: { active: false, startDate: "2026-10-01", durationDays: null },
        slots: [slot("s", "10:00")],
      }),
    );
    expect(plan).toEqual([]);
  });

  it("respects the start date and duration in each time's local calendar", () => {
    const plan = planReposts(
      input({
        list: [{ id: "A", lastRepostedAt: null }],
        schedule: { active: true, startDate: "2026-10-02", durationDays: 2 },
        slots: [slot("s", "12:00", "Europe/Madrid")],
        from: new Date("2026-09-30T00:00:00Z"),
        to: new Date("2026-10-06T00:00:00Z"),
      }),
    );
    expect(plan.map((item) => item.localDate)).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("skips a post reposted less than the minimum interval ago, keeping the others", () => {
    const plan = planReposts(
      input({
        list: [
          { id: "A", lastRepostedAt: new Date("2026-10-01T08:00:00Z") },
          { id: "B", lastRepostedAt: null },
        ],
        slots: [slot("s", "10:00")],
      }),
    );
    expect(summary(plan)).toEqual(["10:00 B", "10:00 A (interval)"]);
  });

  it("skips the whole second batch when times are closer than the interval", () => {
    const plan = planReposts(
      input({
        list: [{ id: "A", lastRepostedAt: null }],
        slots: [slot("a", "08:00"), slot("b", "10:00"), slot("c", "12:00")],
      }),
    );
    expect(summary(plan)).toEqual(["08:00 A", "10:00 A (interval)", "12:00 A"]);
  });

  it("stops at the daily cap, counting reposts already done today", () => {
    const plan = planReposts(
      input({
        slots: [slot("a", "08:00"), slot("b", "14:00")],
        limits: { minIntervalMs: 0, dailyCap: 4 },
        doneByDay: new Map([["2026-10-01", 1]]),
      }),
    );
    expect(plan.map((item) => item.skipReason)).toEqual([
      null,
      null,
      null,
      "daily_cap",
      "daily_cap",
      "daily_cap",
    ]);
  });

  it("counts the daily cap in the workspace timezone", () => {
    // 20:00 NY = 02:00 Madrid next day → belongs to the next Madrid day.
    const plan = planReposts(
      input({
        list: [{ id: "A", lastRepostedAt: null }],
        slots: [slot("eu", "19:00", "Europe/Madrid"), slot("us", "20:00", "America/New_York")],
        limits: { minIntervalMs: 0, dailyCap: 1 },
        to: new Date("2026-10-02T03:00:00Z"),
      }),
    );
    expect(plan.map((item) => item.skipReason)).toEqual([null, null]);
  });

  it("records a single skip when the list is empty", () => {
    const plan = planReposts(input({ list: [], slots: [slot("s", "10:00")] }));
    expect(plan).toMatchObject([
      { key: "s:2026-10-01:empty", postId: null, skipReason: "empty_list" },
    ]);
  });

  it("skips recorded reposts and continues the batch from stored state", () => {
    const plan = planReposts(
      input({
        list: [
          { id: "A", lastRepostedAt: null },
          { id: "B", lastRepostedAt: new Date("2026-10-01T10:00:00Z") },
        ],
        slots: [slot("s", "10:00")],
        skipKeys: new Set(["s:2026-10-01:B"]),
        doneByDay: new Map([["2026-10-01", 1]]),
      }),
    );
    expect(summary(plan)).toEqual(["10:00 A"]);
  });

  it("keeps the local wall time across the European DST change", () => {
    const plan = planReposts(
      input({
        list: [{ id: "A", lastRepostedAt: null }],
        schedule: { active: true, startDate: "2026-10-24", durationDays: 3 },
        slots: [slot("s", "09:00", "Europe/Madrid")],
        limits: { minIntervalMs: 0, dailyCap: 8 },
        from: new Date("2026-10-24T00:00:00Z"),
        to: new Date("2026-10-27T00:00:00Z"),
      }),
    );
    expect(plan.map((item) => item.runAt.toISOString())).toEqual([
      "2026-10-24T07:00:00.000Z",
      "2026-10-25T08:00:00.000Z",
      "2026-10-26T08:00:00.000Z",
    ]);
  });
});
