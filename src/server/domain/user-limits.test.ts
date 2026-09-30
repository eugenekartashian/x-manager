import { describe, expect, it } from "vitest";
import { capToLimits, isValidLimits, type UserLimits } from "./user-limits";

const limits: UserLimits = {
  listPosts: 2,
  dailyTimes: 1,
  targets: 3,
  targetLoadsPerDay: 3,
  aiIdeasPerTargetPerDay: 5,
  targetsEnabled: true,
  aiEnabled: true,
};

describe("capToLimits", () => {
  it("keeps the first posts and times within the limits", () => {
    expect(capToLimits(["a", "b", "c"], ["09:00", "15:00"], limits)).toEqual({
      list: ["a", "b"],
      slots: ["09:00"],
    });
  });

  it("leaves everything for unlimited (superadmin)", () => {
    expect(capToLimits(["a", "b", "c"], ["09:00", "15:00"], null)).toEqual({
      list: ["a", "b", "c"],
      slots: ["09:00", "15:00"],
    });
  });
});

describe("isValidLimits", () => {
  it("accepts bounds and rejects out-of-range or fractional values", () => {
    expect(isValidLimits(limits)).toBe(true);
    expect(isValidLimits({ ...limits, dailyTimes: 9 })).toBe(false);
    expect(isValidLimits({ ...limits, listPosts: 0 })).toBe(false);
    expect(isValidLimits({ ...limits, targets: 1.5 })).toBe(false);
  });
});
