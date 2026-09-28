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
    pinned: { id: "P", lastRepostedAt: null },
    posts: [],
    listCursorPostId: null,
    limits: { minIntervalMs: 4 * H, dailyCap: 8 },
    workspaceTimezone: "Europe/Madrid",
    from: new Date("2026-10-01T00:00:00Z"),
    to: new Date("2026-10-02T00:00:00Z"),
    ...overrides,
  };
}

const slot = (
  id: string,
  localTime: string,
  timezone: string,
  target: PlanSlot["target"],
): PlanSlot => ({
  id,
  localTime,
  timezone,
  target,
});
const pinned = { kind: "pinned" } as const;
const next = { kind: "next" } as const;

const summary = (plan: ReturnType<typeof planReposts>) =>
  plan.map(
    (item) =>
      `${item.runAt.toISOString().slice(11, 16)} ${item.postId ?? "-"}${item.skipReason ? ` (${item.skipReason})` : ""}`,
  );

describe("planReposts", () => {
  it("plans EU and US prime-time slots with the pinned post in both", () => {
    const plan = planReposts(
      input({
        slots: [
          slot("eu", "10:00", "Europe/Madrid", pinned),
          slot("mid", "13:00", "Europe/Madrid", next),
          slot("us", "10:00", "America/New_York", pinned),
          slot("usEve", "21:00", "America/New_York", next),
        ],
        to: new Date("2026-10-02T06:00:00Z"),
      }),
    );

    // 10:00 Madrid = 08:00Z, 13:00 Madrid = 11:00Z, 10:00 NY = 14:00Z, 21:00 NY = 01:00Z next day.
    expect(summary(plan)).toEqual(["08:00 P", "11:00 A", "14:00 P", "01:00 B"]);
    expect(plan[0]?.key).toBe("eu:2026-10-01");
  });

  it("returns nothing when the schedule is off", () => {
    const plan = planReposts(
      input({
        schedule: { active: false, startDate: "2026-10-01", durationDays: null },
        slots: [slot("s", "10:00", "Europe/Madrid", pinned)],
      }),
    );
    expect(plan).toEqual([]);
  });

  it("respects the start date and duration in each slot's local calendar", () => {
    const plan = planReposts(
      input({
        schedule: { active: true, startDate: "2026-10-02", durationDays: 2 },
        slots: [slot("s", "12:00", "Europe/Madrid", next)],
        from: new Date("2026-09-30T00:00:00Z"),
        to: new Date("2026-10-06T00:00:00Z"),
      }),
    );
    expect(plan.map((item) => item.localDate)).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("cycles through the repost list and continues after the cursor", () => {
    const slots = [
      slot("a", "08:00", "UTC", next),
      slot("b", "14:00", "UTC", next),
      slot("c", "20:00", "UTC", next),
    ];
    const plan = planReposts(
      input({ slots, listCursorPostId: "B", to: new Date("2026-10-02T15:00:00Z") }),
    );
    expect(summary(plan)).toEqual(["08:00 C", "14:00 A", "20:00 B", "08:00 C", "14:00 A"]);
  });

  it("starts from the top when the cursor post left the list", () => {
    const plan = planReposts(
      input({ slots: [slot("a", "08:00", "UTC", next)], listCursorPostId: "gone" }),
    );
    expect(summary(plan)).toEqual(["08:00 A"]);
  });

  it("skips a post reposted less than the minimum interval ago", () => {
    const plan = planReposts(
      input({
        slots: [
          slot("a", "08:00", "UTC", pinned),
          slot("b", "10:00", "UTC", pinned),
          slot("c", "12:00", "UTC", pinned),
        ],
      }),
    );
    expect(summary(plan)).toEqual(["08:00 P", "10:00 P (interval)", "12:00 P"]);
  });

  it("takes the next cooled-down post from the list, or skips when all are cooling", () => {
    const recent = new Date("2026-10-01T07:00:00Z");
    const plan = planReposts(
      input({
        list: [
          { id: "A", lastRepostedAt: recent },
          { id: "B", lastRepostedAt: null },
        ],
        slots: [slot("a", "08:00", "UTC", next), slot("b", "09:00", "UTC", next)],
      }),
    );
    expect(summary(plan)).toEqual(["08:00 B", "09:00 - (interval)"]);
  });

  it("stops at the daily cap, counting reposts already done today", () => {
    const slots = ["06", "08", "10", "12", "14"].map((hour) =>
      slot(`s${hour}`, `${hour}:00`, "Europe/Madrid", next),
    );
    const plan = planReposts(
      input({
        slots,
        limits: { minIntervalMs: 0, dailyCap: 3 },
        doneByDay: new Map([["2026-10-01", 1]]),
      }),
    );
    expect(plan.map((item) => item.skipReason)).toEqual([
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
        slots: [
          slot("eu", "19:00", "Europe/Madrid", next),
          slot("us", "20:00", "America/New_York", next),
        ],
        limits: { minIntervalMs: 0, dailyCap: 1 },
        to: new Date("2026-10-02T03:00:00Z"),
      }),
    );
    expect(plan.map((item) => item.skipReason)).toEqual([null, null]);
  });

  it("explains why a slot cannot run", () => {
    const plan = planReposts(
      input({
        pinned: null,
        list: [],
        slots: [
          slot("p", "08:00", "UTC", pinned),
          slot("n", "09:00", "UTC", next),
          slot("x", "10:00", "UTC", { kind: "post", ownPostId: null }),
          slot("y", "11:00", "UTC", { kind: "post", ownPostId: "unknown" }),
        ],
      }),
    );
    expect(plan.map((item) => item.skipReason)).toEqual([
      "no_pinned",
      "empty_list",
      "no_post",
      "no_post",
    ]);
  });

  it("reposts a specific chosen post", () => {
    const plan = planReposts(
      input({
        posts: [{ id: "X", lastRepostedAt: null }],
        slots: [slot("x", "10:00", "UTC", { kind: "post", ownPostId: "X" })],
      }),
    );
    expect(summary(plan)).toEqual(["10:00 X"]);
  });

  it("keeps the local wall time across the European DST change", () => {
    const plan = planReposts(
      input({
        schedule: { active: true, startDate: "2026-10-24", durationDays: 3 },
        slots: [slot("s", "09:00", "Europe/Madrid", pinned)],
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
