// Repost checks (M7.3, D-033): per creator, on the user's click only. One X recent-search query
// per check finds that creator's Repost/quote of the promoted post — exact, ≤ 2 results.

/** A messaged creator who hasn't reposted after this long becomes "No reply" (free). */
export const REPOST_WAIT_MS = 3 * 24 * 3_600_000;
/** X recent search covers the last 7 days — older messages can't be checked. */
export const SEARCH_WINDOW_MS = 7 * 24 * 3_600_000;
/** Worst case per check: a Repost and a quote ($0.005 each). */
export const MAX_CHECK_COST_MICROS = 10_000;
/** Regular users: manual checks per local day (each ≤ $0.01). */
export const USER_CHECKS_PER_DAY = 30;
/** "Check all waiting" checks at most this many creators per click. */
export const MAX_BATCH_CHECKS = 30;
