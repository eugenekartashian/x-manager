import "server-only";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import {
  getMe,
  getPost,
  searchCreatorRepost,
  getUsersByUsernames,
  listOwnPosts,
  repost,
  sendDirectMessage,
  undoRepost,
  type CreatorRepost,
  type RepostOutcome,
  type XPost,
  type XProfile,
} from "@/server/integrations/x/client";
import { XApiError } from "@/server/integrations/x/errors";
import { X_PRICE_MICROS, type XBillableOperation } from "@/server/integrations/x/pricing";
import { recordUsage, type BillableResources } from "@/server/repositories/usage";
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
    return {
      data: page,
      usage: [
        {
          operation: "ownedPostRead",
          units: page.billedPostIds.length,
          resources: { kind: "post", ids: page.billedPostIds },
        },
        {
          operation: "postRead",
          units: page.quotedPostIds.length,
          resources: { kind: "post", ids: page.quotedPostIds },
        },
      ],
    };
  });
}

/** Latest original posts of another account (not "owned" reads — billed as Post reads). */
export function fetchUserPosts(
  workspaceId: string,
  xUserId: string,
  maxResults: number,
): Promise<Result<XPost[], XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const page = await listOwnPosts(accessToken, xUserId, { maxResults });
    return {
      data: page.posts,
      usage: {
        operation: "postRead",
        units: page.billedPostIds.length + page.quotedPostIds.length,
        resources: { kind: "post", ids: [...page.billedPostIds, ...page.quotedPostIds] },
      },
    };
  });
}

/** Public profiles by @handle (≤ 100). Billed per returned user, once per UTC day. */
export function lookupUsers(
  workspaceId: string,
  usernames: string[],
): Promise<Result<XProfile[], XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const users = await getUsersByUsernames(accessToken, usernames);
    return {
      data: users,
      usage: {
        operation: "userRead",
        units: users.length,
        resources: { kind: "user", ids: users.map((user) => user.id) },
      },
    };
  });
}

/** Exact "did this creator repost/quote my post" check (recent search). Billed per result. */
export function findCreatorRepost(
  workspaceId: string,
  authorXUserId: string,
  postId: string,
): Promise<Result<CreatorRepost[], XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const found = await searchCreatorRepost(accessToken, authorXUserId, postId);
    return {
      data: found,
      usage: {
        operation: "postRead",
        units: found.length,
        resources: { kind: "post", ids: found.map((post) => post.id) },
      },
    };
  });
}

/** Id of the post pinned to the connected profile, if any (one billable User read). */
export function fetchPinnedPostId(
  workspaceId: string,
): Promise<Result<string | null, XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const me = await getMe(accessToken);
    return {
      data: me.pinnedPostId,
      usage: { operation: "userRead", units: 1, resources: { kind: "user", ids: [me.id] } },
    };
  });
}

/** One post by id with its author (null if missing/invisible). One billable Post read. */
export function fetchPost(
  workspaceId: string,
  postId: string,
): Promise<Result<(XPost & { authorId: string }) | null, XActionError>> {
  return callX(workspaceId, "read", async ({ accessToken }) => {
    const post = await getPost(accessToken, postId);
    return {
      data: post,
      usage: post
        ? {
            operation: "postRead",
            units: 1 + post.quotedPostIds.length,
            resources: { kind: "post", ids: [post.id, ...post.quotedPostIds] },
          }
        : { operation: "postRead", units: 0 },
    };
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

/** One direct message to one X user (dm.write scope; D-034). */
export function sendDm(
  workspaceId: string,
  recipientXUserId: string,
  text: string,
): Promise<Result<{ eventId: string }, XActionError>> {
  return callX(
    workspaceId,
    "write",
    async ({ accessToken }) => {
      const sent = await sendDirectMessage(accessToken, recipientXUserId, text);
      return { data: { eventId: sent.eventId }, usage: DM_USAGE };
    },
    DM_USAGE,
  );
}

// ─── Internals ───────────────────────────────────────────────────────────────

/** `resources` (reads only): ids X returned — billed once per resource per UTC day. */
type Usage = { operation: XBillableOperation; units: number; resources?: BillableResources };

const REPOST_USAGE: Usage = { operation: "repost", units: 1 };
const UNDO_REPOST_USAGE: Usage = { operation: "undoRepost", units: 1 };
const DM_USAGE: Usage = { operation: "dmSend", units: 1 };

async function callX<T>(
  workspaceId: string,
  kind: CallKind,
  call: (credentials: XCredentials) => Promise<{ data: T; usage: Usage | Usage[] }>,
  // Recorded when a write's outcome is unknown: X may have applied (and billed) it.
  usageIfUnknown?: Usage,
): Promise<Result<T, XActionError>> {
  const credentials = await getXCredentials(workspaceId);
  if (!credentials.ok) return credentials;

  try {
    const { data, usage } = await call(credentials.data);
    for (const item of Array.isArray(usage) ? usage : [usage]) await record(workspaceId, item);
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
    unitPriceMicros: X_PRICE_MICROS[usage.operation],
    ...(usage.resources ? { resources: usage.resources } : {}),
  });
}
