import "server-only";
import type { OwnPost } from "@/generated/prisma/client";
import { parsePostUrl } from "@/lib/post-url";
import { err, ok, type Result } from "@/lib/result";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import * as posts from "@/server/repositories/own-posts";
import { claimPostsSync } from "@/server/repositories/workspaces";
import { canSpend, getBudgetStatus, type BudgetStatus } from "@/server/services/budget";
import {
  connectedXUserId,
  fetchOwnPosts,
  fetchPinnedPostId,
  fetchPost,
  type XActionError,
} from "@/server/services/x-api";

export const RECENT_PAGE_SIZE = 20;
export const REFRESH_MIN_INTERVAL_MS = 60_000;
/** Base cost of one refresh: a page of posts, the profile (pinned id), maybe the pinned post. */
export const REFRESH_ESTIMATE_MICROS =
  RECENT_PAGE_SIZE * X_PRICE_MICROS.ownedPostRead +
  X_PRICE_MICROS.userRead +
  X_PRICE_MICROS.postRead;
/** Budget guard uses the worst case: every post in the page quotes another post. */
const REFRESH_WORST_CASE_MICROS =
  REFRESH_ESTIMATE_MICROS + (RECENT_PAGE_SIZE + 1) * X_PRICE_MICROS.postRead;

type Scope = posts.OwnPostScope;

async function scopeFor(workspaceId: string): Promise<Result<Scope, XActionError>> {
  const xUserId = await connectedXUserId(workspaceId);
  return xUserId.ok ? ok({ workspaceId, xUserId: xUserId.data }) : xUserId;
}

// ─── Refresh from X ──────────────────────────────────────────────────────────

export type RefreshError = XActionError | "too_soon" | "budget_exceeded";

export async function refreshOwnPosts(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Result<{ synced: number }, RefreshError>> {
  const scope = await scopeFor(workspaceId);
  if (!scope.ok) return scope;
  if (!(await canSpend(workspaceId, REFRESH_WORST_CASE_MICROS, now))) return err("budget_exceeded");
  if (!(await claimPostsSync(workspaceId, now, REFRESH_MIN_INTERVAL_MS))) return err("too_soon");

  const page = await fetchOwnPosts(workspaceId, { maxResults: RECENT_PAGE_SIZE });
  if (!page.ok) return page;
  await posts.upsertPosts(scope.data, page.data.posts, now);

  const pinned = await fetchPinnedPostId(workspaceId);
  if (!pinned.ok) return pinned;
  const pinnedId = pinned.data;

  // The pinned post is often old and outside the recent page — fetch it directly on
  // every refresh so its media and metrics stay current (X dedupes same-day reads).
  if (pinnedId && !page.data.posts.some((post) => post.id === pinnedId)) {
    const post = await fetchPost(workspaceId, pinnedId);
    if (!post.ok) return post;
    if (post.data && post.data.authorId === scope.data.xUserId) {
      await posts.upsertPosts(scope.data, [post.data], now);
    }
  }
  await posts.setPinned(scope.data, pinnedId);
  await posts.pruneStale(
    scope.data,
    page.data.posts.map((post) => post.id),
  );

  return ok({ synced: page.data.posts.length });
}

// ─── Add by link ─────────────────────────────────────────────────────────────

export type AddByUrlError =
  XActionError | "invalid_url" | "not_found" | "not_own_post" | "budget_exceeded";

/** Adds one of the user's own posts to the rotation from a link or id. */
export async function addPostToRotationByUrl(
  workspaceId: string,
  input: string,
  now: Date = new Date(),
): Promise<Result<{ xPostId: string }, AddByUrlError>> {
  const parsed = parsePostUrl(input);
  if (!parsed) return err("invalid_url");

  const scope = await scopeFor(workspaceId);
  if (!scope.ok) return scope;

  let post = await posts.findByXPostId(scope.data, parsed.postId);
  if (!post) {
    if (!(await canSpend(workspaceId, X_PRICE_MICROS.postRead, now))) return err("budget_exceeded");
    const fetched = await fetchPost(workspaceId, parsed.postId);
    if (!fetched.ok) return fetched;
    if (!fetched.data) return err("not_found");
    // Only the user's own posts may be reposted (D-003).
    if (fetched.data.authorId !== scope.data.xUserId) return err("not_own_post");
    await posts.upsertPosts(scope.data, [fetched.data], now);
    post = await posts.findByXPostId(scope.data, parsed.postId);
    if (!post) return err("not_found");
  }

  await posts.addToRotation(scope.data, post.id);
  return ok({ xPostId: post.xPostId });
}

// ─── Rotation edits (local only, free) ───────────────────────────────────────

export type RotationError = XActionError | "not_found";

export async function setInRotation(
  workspaceId: string,
  ownPostId: string,
  inRotation: boolean,
): Promise<Result<null, RotationError>> {
  const scope = await scopeFor(workspaceId);
  if (!scope.ok) return scope;
  const changed = inRotation
    ? await posts.addToRotation(scope.data, ownPostId)
    : await posts.removeFromRotation(scope.data, ownPostId);
  return changed ? ok(null) : err("not_found");
}

export async function moveInRotation(
  workspaceId: string,
  ownPostId: string,
  direction: "up" | "down",
): Promise<Result<null, RotationError>> {
  const scope = await scopeFor(workspaceId);
  if (!scope.ok) return scope;
  return (await posts.moveInRotation(scope.data, ownPostId, direction))
    ? ok(null)
    : err("not_found");
}

// ─── Page data ───────────────────────────────────────────────────────────────

export type PostsPageData =
  | { connected: false; reason: XActionError }
  | {
      connected: true;
      rotation: OwnPost[];
      recent: OwnPost[];
      budget: BudgetStatus;
    };

export async function getPostsPageData(
  workspaceId: string,
  now: Date = new Date(),
): Promise<PostsPageData> {
  const scope = await scopeFor(workspaceId);
  if (!scope.ok) return { connected: false, reason: scope.error };
  const [rotation, recent, budget] = await Promise.all([
    posts.listRotation(scope.data),
    posts.listRecent(scope.data),
    getBudgetStatus(workspaceId, now),
  ]);
  return { connected: true, rotation, recent, budget };
}
