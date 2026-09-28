import "server-only";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import {
  getMe,
  getPost,
  listOwnPosts,
  repost,
  undoRepost,
  type RepostOutcome,
  type XPost,
} from "@/server/integrations/x/client";
import { XApiError } from "@/server/integrations/x/errors";
import { X_PRICE_MICROS, type XBillableOperation } from "@/server/integrations/x/pricing";
import { recordUsage } from "@/server/repositories/usage";
import {
  getXCredentials,
  markNeedsReconnect,
  type TokenError,
  type XCredentials,
} from "@/server/services/x-connection";

// Workspace-aware X calls: resolve credentials, call X once (never retried here),
// record estimated cost, and translate X failures into app-level errors.

export type XActionError =
  | TokenError
  | "rate_limited" // 429 — try again after the window resets
  | "no_credits" // 402 — top up X credits / raise the Console cap
  | "forbidden" // 403 — not allowed (e.g. protected or restricted post)
  | "not_found" // 404 — post deleted or not visible
  | "unknown_outcome"; // write may or may not have happened — re-check, never blind-retry

type CallKind = "read" | "write";

export function fetchOwnPosts(
  workspaceId: string,
  options: { maxResults?: number; paginationToken?: string } = {},
): Promise<Result<{ posts: XPost[]; nextToken: string | null }, XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken, xUserId }) => {
    const page = await listOwnPosts(accessToken, xUserId, options);
    return { data: page, usage: { operation: "ownedPostRead", units: page.posts.length } };
  });
}

/** Id of the post pinned to the connected profile, if any (one billable User read). */
export function fetchPinnedPostId(
  workspaceId: string,
): Promise<Result<string | null, XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const me = await getMe(accessToken);
    return { data: me.pinnedPostId, usage: { operation: "userRead", units: 1 } };
  });
}

/** One post by id with its author (null if missing/invisible). One billable Post read. */
export function fetchPost(
  workspaceId: string,
  postId: string,
): Promise<Result<(XPost & { authorId: string }) | null, XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const post = await getPost(accessToken, postId);
    return { data: post, usage: { operation: "postRead", units: post ? 1 : 0 } };
  });
}

/** X user id of the connected account, without calling X. */
export async function connectedXUserId(workspaceId: string): Promise<Result<string, TokenError>> {
  const credentials = await getXCredentials(workspaceId);
  return credentials.ok ? ok(credentials.data.xUserId) : credentials;
}

export function repostPost(
  workspaceId: string,
  postId: string,
): Promise<Result<RepostOutcome, XActionError>> {
  return callX(
    workspaceId,
    "write",
    async ({ accessToken, xUserId }) => {
      const outcome = await repost(accessToken, xUserId, postId);
      return { data: outcome, usage: REPOST_USAGE };
    },
    REPOST_USAGE,
  );
}

export function undoRepostPost(
  workspaceId: string,
  postId: string,
): Promise<Result<"undone", XActionError>> {
  return callX(
    workspaceId,
    "write",
    async ({ accessToken, xUserId }) => {
      await undoRepost(accessToken, xUserId, postId);
      return { data: "undone" as const, usage: UNDO_REPOST_USAGE };
    },
    UNDO_REPOST_USAGE,
  );
}

// ─── Internals ───────────────────────────────────────────────────────────────

type Usage = { operation: XBillableOperation; units: number };

const REPOST_USAGE: Usage = { operation: "repost", units: 1 };
const UNDO_REPOST_USAGE: Usage = { operation: "undoRepost", units: 1 };

async function callX<T>(
  workspaceId: string,
  kind: CallKind,
  call: (credentials: XCredentials) => Promise<{ data: T; usage: Usage }>,
  // Recorded when a write's outcome is unknown: X may have applied (and billed) it.
  usageIfUnknown?: Usage,
): Promise<Result<T, XActionError>> {
  const credentials = await getXCredentials(workspaceId);
  if (!credentials.ok) return credentials;

  try {
    const { data, usage } = await call(credentials.data);
    await record(workspaceId, usage);
    return ok(data);
  } catch (error) {
    if (!(error instanceof XApiError)) throw error;
    const mapped = mapXError(error, kind);
    logger.warn("x.call_failed", {
      workspaceId,
      kind,
      code: error.code,
      status: error.status,
      mapped,
    });
    if (mapped === "needs_reconnect") await markNeedsReconnect(workspaceId);
    if (mapped === "unknown_outcome" && usageIfUnknown) await record(workspaceId, usageIfUnknown);
    return err(mapped);
  }
}

export function mapXError(error: XApiError, kind: CallKind): XActionError {
  switch (error.code) {
    case "X_AUTH_EXPIRED":
    case "X_INVALID_GRANT":
      return "needs_reconnect";
    case "X_PAYMENT_REQUIRED":
      return "no_credits";
    case "X_RATE_LIMITED":
      return "rate_limited";
    case "X_FORBIDDEN":
      return "forbidden";
    case "X_NOT_FOUND":
      return "not_found";
    case "X_NETWORK":
    case "X_UNAVAILABLE":
    case "X_BAD_RESPONSE":
      // For a write, X may have applied it before failing to answer.
      return kind === "write" ? "unknown_outcome" : "x_unavailable";
  }
}

async function record(workspaceId: string, usage: Usage): Promise<void> {
  if (usage.units === 0) return;
  await recordUsage({
    workspaceId,
    provider: "X",
    operation: usage.operation,
    units: usage.units,
    costMicros: X_PRICE_MICROS[usage.operation] * usage.units,
  });
}
