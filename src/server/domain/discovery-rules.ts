// "Find similar" (D-038): suggestions from the accounts a listed creator follows.

/** Users read per run — X bills each returned user ($0.010), so one run is ≤ $1. */
export const FOLLOWING_PAGE_SIZE = 100;
/** Smaller accounts are not suggested (owner decision). */
export const MIN_CANDIDATE_FOLLOWERS = 10_000;
/** Suggestions shown at once. */
export const MAX_PENDING_SHOWN = 200;
