// Incremental repost checks (M7.3, D-033). X returns a post's reposters newest first, so a
// check reads pages from the top and stops once it runs into accounts it already saw.

export const REPOSTERS_PAGE_SIZE = 20;
/** At most this many pages per post per check (≈ 100 users ≈ $1 worst case). */
export const MAX_REPOSTER_PAGES = 5;
/**
 * The first check of a post has nothing "seen" to stop at, so it reads only the newest
 * 2 pages (≈ 40 users ≈ $0.40): creators who were messaged repost after that, i.e. on top.
 */
export const FIRST_CHECK_PAGES = 2;
/** Stop after this many already-seen accounts in a row (one old account may have re-reposted). */
export const STOP_AFTER_KNOWN = 3;
/** Remembered reposters per post (newest first). */
export const SEEN_CAP = 300;
/** A messaged creator who hasn't reposted after this long becomes "No reply". */
export const REPOST_WAIT_MS = 3 * 24 * 3_600_000;
/** The automatic check runs at most this often per post. */
export const AUTO_CHECK_EVERY_MS = 20 * 3_600_000;

export type ScanState = { fresh: string[]; knownRun: number; stop: boolean };

/** Processes one page (newest first) against the accounts seen in earlier checks. */
export function scanReposterPage(
  ids: string[],
  seen: ReadonlySet<string>,
  state: ScanState,
): ScanState {
  const fresh = [...state.fresh];
  let knownRun = state.knownRun;
  for (const id of ids) {
    if (seen.has(id)) {
      knownRun += 1;
      if (knownRun >= STOP_AFTER_KNOWN) return { fresh, knownRun, stop: true };
    } else {
      knownRun = 0;
      if (!fresh.includes(id)) fresh.push(id);
    }
  }
  return { fresh, knownRun, stop: false };
}

/** New seen-list: fresh first (newest first), then the old ones, capped. */
export function mergeSeen(fresh: string[], previous: string[]): string[] {
  const merged = [...fresh, ...previous.filter((id) => !fresh.includes(id))];
  return merged.slice(0, SEEN_CAP);
}
