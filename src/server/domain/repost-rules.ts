// Repost limits (D-003). Configurable per workspace from M2.3; these are the defaults.
export const PER_POST_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DAILY_REPOST_CAP = 6;

/** When this post may be reposted again, or null if it is ready now. */
export function nextRepostAllowedAt(lastRepostedAt: Date | null, now: Date): Date | null {
  if (!lastRepostedAt) return null;
  const next = new Date(lastRepostedAt.getTime() + PER_POST_MIN_INTERVAL_MS);
  return next > now ? next : null;
}
