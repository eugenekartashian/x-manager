import "server-only";
import type { CreatorCandidate } from "@/generated/prisma/client";
import { err, ok, type Result } from "@/lib/result";
import {
  FOLLOWING_PAGE_SIZE,
  MAX_PENDING_SHOWN,
  MIN_CANDIDATE_FOLLOWERS,
} from "@/server/domain/discovery-rules";
import type { XProfile } from "@/server/integrations/x/client";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import * as candidates from "@/server/repositories/candidates";
import * as replies from "@/server/repositories/replies";
import * as targets from "@/server/repositories/targets";
import { canSpend } from "@/server/services/budget";
import { getLimits } from "@/server/services/limits";
import { MAX_TARGETS } from "@/server/services/targets";
import { connectedXUserId, fetchFollowing, type XActionError } from "@/server/services/x-api";

// "Find similar" (D-038): read one page of the accounts a listed creator follows, keep the
// ones worth suggesting, and let the user Add or Skip them. Nothing is added automatically.

export type FindSimilarError = XActionError | "not_found" | "nothing_left" | "budget_exceeded";

export type FindSimilarSummary = {
  /** Users X returned (each billed). */
  read: number;
  suggested: number;
  alreadyKnown: number;
  tooSmall: number;
  /** The creator's following list was read to the end. */
  finished: boolean;
};

/** Max cost of one run (shown before the click). */
export const FIND_SIMILAR_MAX_MICROS = FOLLOWING_PAGE_SIZE * X_PRICE_MICROS.followingRead;

export async function findSimilar(
  workspaceId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<Result<FindSimilarSummary, FindSimilarError>> {
  const target = await replies.findTarget(workspaceId, targetId);
  if (!target) return err("not_found");
  if (target.followingExhausted) return err("nothing_left");
  const me = await connectedXUserId(workspaceId);
  if (!me.ok) return me;
  if (!(await canSpend(workspaceId, FIND_SIMILAR_MAX_MICROS, now))) return err("budget_exceeded");

  // Continue where the last run stopped, so the same people aren't paid for again.
  const page = await fetchFollowing(workspaceId, target.xUserId, {
    maxResults: FOLLOWING_PAGE_SIZE,
    paginationToken: target.followingCursor,
  });
  if (!page.ok) return page;
  await candidates.saveFollowingCursor(workspaceId, target.id, page.data.nextToken);

  const profiles = page.data.profiles.filter((profile) => profile.id !== me.data);
  const known = await candidates.knownXUserIds(
    workspaceId,
    profiles.map((profile) => profile.id),
  );
  const fresh = profiles.filter((profile) => !known.has(profile.id));
  const bigEnough = fresh.filter((profile) => (profile.followers ?? 0) >= MIN_CANDIDATE_FOLLOWERS);
  const suggested = await candidates.insertCandidates(workspaceId, bigEnough, target.username);

  return ok({
    read: page.data.profiles.length,
    suggested,
    alreadyKnown: profiles.length - fresh.length,
    tooSmall: fresh.length - bigEnough.length,
    finished: page.data.nextToken === null,
  });
}

export function listSuggestions(workspaceId: string): Promise<CreatorCandidate[]> {
  return candidates.listPendingCandidates(workspaceId, MAX_PENDING_SHOWN);
}

export function countSuggestions(workspaceId: string): Promise<number> {
  return candidates.countPendingCandidates(workspaceId);
}

export type AddSuggestionsError = "invalid_selection" | "list_full";

/** Adds the chosen suggestions as creators (no X call — the profiles are already known). */
export async function addSuggestions(
  workspaceId: string,
  ids: string[],
  now: Date = new Date(),
): Promise<Result<{ added: number }, AddSuggestionsError>> {
  if (ids.length === 0 || ids.length > MAX_PENDING_SHOWN) return err("invalid_selection");
  const chosen = await candidates.findPendingCandidates(workspaceId, ids);
  if (chosen.length === 0) return err("invalid_selection");
  const limits = await getLimits(workspaceId);
  const cap = Math.min(MAX_TARGETS, limits?.targets ?? MAX_TARGETS);
  if ((await targets.countTargets(workspaceId)) + chosen.length > cap) return err("list_full");

  await targets.upsertTargets(workspaceId, chosen.map(toProfile), now, "DISCOVERY");
  await candidates.setCandidatesStatus(
    workspaceId,
    chosen.map((candidate) => candidate.id),
    "ADDED",
  );
  return ok({ added: chosen.length });
}

export async function skipSuggestions(
  workspaceId: string,
  ids: string[],
): Promise<Result<{ skipped: number }, "invalid_selection">> {
  if (ids.length === 0 || ids.length > MAX_PENDING_SHOWN) return err("invalid_selection");
  return ok({ skipped: await candidates.setCandidatesStatus(workspaceId, ids, "SKIPPED") });
}

function toProfile(candidate: CreatorCandidate): XProfile {
  return {
    id: candidate.xUserId,
    username: candidate.username,
    name: candidate.name,
    bio: candidate.bio,
    avatarUrl: candidate.avatarUrl,
    verified: candidate.verified,
    followers: candidate.followersCount,
    following: candidate.followingCount,
    posts: candidate.postsCount,
    followsYou: candidate.followsYou ?? false,
    youFollow: candidate.youFollow ?? false,
  };
}
