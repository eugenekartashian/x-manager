import "server-only";
import type { TargetAccount } from "@/generated/prisma/client";
import { formatSpreadsheetDateTime } from "@/lib/format";
import { parseHandles } from "@/lib/handles";
import { err, ok, type Result } from "@/lib/result";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import * as targets from "@/server/repositories/targets";
import { canSpend } from "@/server/services/budget";
import { connectedXUserId, lookupUsers, type XActionError } from "@/server/services/x-api";

// Target list for the reply assistant (M3). Replies are posted by the user on x.com —
// the X API only allows replies when summoned (D-008).

/** One X lookup call takes at most 100 handles. */
export const MAX_HANDLES_PER_ADD = 100;
export const MAX_TARGETS = 500;
export const MAX_NOTE_LENGTH = 200;

export type AddTargetsResult = {
  added: string[];
  alreadyInList: string[];
  notFound: string[];
  invalid: string[];
  skippedSelf: boolean;
};

export type AddTargetsError =
  XActionError | "nothing_to_add" | "too_many" | "list_full" | "budget_exceeded";

export async function addTargets(
  workspaceId: string,
  input: string,
  now: Date = new Date(),
): Promise<Result<AddTargetsResult, AddTargetsError>> {
  const { handles, invalid } = parseHandles(input);
  if (handles.length === 0) return err("nothing_to_add");
  if (handles.length > MAX_HANDLES_PER_ADD) return err("too_many");

  const me = await connectedXUserId(workspaceId);
  if (!me.ok) return me;

  // Already listed handles are skipped without calling X (and without paying).
  const existing = await targets.existingUsernames(workspaceId, handles);
  const toLookUp = handles.filter((handle) => !existing.has(handle.toLowerCase()));
  const alreadyInList = handles.filter((handle) => existing.has(handle.toLowerCase()));
  if (toLookUp.length === 0) {
    return ok({ added: [], alreadyInList, notFound: [], invalid, skippedSelf: false });
  }

  if ((await targets.countTargets(workspaceId)) + toLookUp.length > MAX_TARGETS)
    return err("list_full");
  if (!(await canSpend(workspaceId, toLookUp.length * X_PRICE_MICROS.userRead, now)))
    return err("budget_exceeded");

  const found = await lookupUsers(workspaceId, toLookUp);
  if (!found.ok) return found;

  const profiles = found.data.filter((profile) => profile.id !== me.data);
  await targets.upsertTargets(workspaceId, profiles, now);

  const foundNames = new Set(found.data.map((profile) => profile.username.toLowerCase()));
  return ok({
    added: profiles.map((profile) => profile.username),
    alreadyInList,
    notFound: toLookUp.filter((handle) => !foundNames.has(handle.toLowerCase())),
    invalid,
    skippedSelf: profiles.length < found.data.length,
  });
}

export function listTargets(
  workspaceId: string,
  sort: targets.TargetSort,
): Promise<TargetAccount[]> {
  return targets.listTargets(workspaceId, sort);
}

export async function removeTarget(
  workspaceId: string,
  id: string,
): Promise<Result<null, "not_found">> {
  return (await targets.deleteTarget(workspaceId, id)) ? ok(null) : err("not_found");
}

export async function saveTargetNote(
  workspaceId: string,
  id: string,
  note: string,
): Promise<Result<null, "not_found" | "too_long">> {
  const trimmed = note.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) return err("too_long");
  return (await targets.updateTargetNote(workspaceId, id, trimmed || null))
    ? ok(null)
    : err("not_found");
}

// ─── CSV export (opens in Excel) ─────────────────────────────────────────────

// Dates are in the workspace timezone, to the minute.
function csvColumns(timeZone: string): [string, (target: TargetAccount) => string][] {
  const date = (value: Date | null) => (value ? formatSpreadsheetDateTime(value, timeZone) : "");
  return [
    ["username", (t) => `@${t.username}`],
    ["name", (t) => t.name],
    ["followers", (t) => (t.followersCount === null ? "" : String(t.followersCount))],
    ["following", (t) => (t.followingCount === null ? "" : String(t.followingCount))],
    ["posts", (t) => (t.postsCount === null ? "" : String(t.postsCount))],
    ["bio", (t) => t.bio ?? ""],
    ["note", (t) => t.note ?? ""],
    ["last_replied_at", (t) => date(t.lastRepliedAt)],
    ["profile_url", (t) => `https://x.com/${t.username}`],
    // Followers/following/posts are a snapshot from this lookup, not live numbers.
    ["stats_as_of", (t) => date(t.lookedUpAt)],
    ["added_at", (t) => date(t.createdAt)],
  ];
}

export async function exportTargetsCsv(workspaceId: string, timeZone: string): Promise<string> {
  const rows = await targets.listTargets(workspaceId, "followers");
  const columns = csvColumns(timeZone);
  const lines = [
    columns.map(([header]) => header).join(","),
    ...rows.map((row) => columns.map(([, value]) => csvCell(value(row))).join(",")),
  ];
  return lines.join("\r\n");
}

/**
 * Quotes a CSV cell and neutralises spreadsheet formulas: cells starting with = + - @
 * (or tab/CR) are prefixed with ' so Excel shows them as text instead of executing them.
 * Our own "@username" column is the one intended exception.
 */
export function csvCell(value: string): string {
  const safe =
    /^[=+\-@\t\r]/.test(value) && !/^@[A-Za-z0-9_]{1,15}$/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
