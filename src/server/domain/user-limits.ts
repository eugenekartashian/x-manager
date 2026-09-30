// Per-user limits (M6.3, D-026). Set by the superadmin; superadmins themselves are unlimited
// (represented as `null` limits). Bounds keep admin input sane and within the app-wide caps.

export type UserLimits = {
  listPosts: number;
  dailyTimes: number;
  targets: number;
  targetLoadsPerDay: number;
  aiIdeasPerTargetPerDay: number;
  targetsEnabled: boolean;
  aiEnabled: boolean;
};

export const LIMIT_BOUNDS = {
  listPosts: { min: 1, max: 25 }, // MAX_LIST_SIZE
  dailyTimes: { min: 1, max: 8 }, // MAX_SLOTS
  targets: { min: 0, max: 500 }, // MAX_TARGETS
  targetLoadsPerDay: { min: 0, max: 50 },
  aiIdeasPerTargetPerDay: { min: 0, max: 50 },
} as const;

export type NumericLimit = keyof typeof LIMIT_BOUNDS;

export function isValidLimits(limits: UserLimits): boolean {
  return (Object.keys(LIMIT_BOUNDS) as NumericLimit[]).every((key) => {
    const value = limits[key];
    return (
      Number.isInteger(value) && value >= LIMIT_BOUNDS[key].min && value <= LIMIT_BOUNDS[key].max
    );
  });
}

/** What the job and the preview may use: the first N posts of the list and the first N times. */
export function capToLimits<P, S>(
  list: P[],
  slots: S[],
  limits: UserLimits | null,
): { list: P[]; slots: S[] } {
  if (!limits) return { list, slots };
  return { list: list.slice(0, limits.listPosts), slots: slots.slice(0, limits.dailyTimes) };
}
