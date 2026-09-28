import "server-only";
import { XApiError } from "./errors";
import { X_API_BASE, xRequest } from "./http";
import {
  meResponseSchema,
  postByIdResponseSchema,
  repostResponseSchema,
  userPostsResponseSchema,
} from "./schemas";

// Typed X API v2 calls. Pure protocol: no database, no cost accounting — see
// src/server/services/x-api.ts for the workspace-aware wrapper.

export type XUser = { id: string; username: string; name: string; pinnedPostId: string | null };

export type XPost = {
  id: string;
  text: string;
  createdAt: Date;
  metrics: {
    reposts: number;
    replies: number;
    likes: number;
    quotes: number;
    impressions: number | null;
  } | null;
};

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

/** GET /2/users/me — one billable User resource. */
export async function getMe(accessToken: string): Promise<XUser> {
  const url = new URL(`${X_API_BASE}/2/users/me`);
  url.searchParams.set("user.fields", "pinned_tweet_id");
  const { data } = await xRequest(
    { method: "GET", url: url.toString(), headers: bearer(accessToken) },
    meResponseSchema,
  );
  return {
    id: data.id,
    username: data.username,
    name: data.name,
    pinnedPostId: data.pinned_tweet_id ?? null,
  };
}

/**
 * GET /2/users/:id/tweets — the user's own original posts, newest first.
 * Replies and Reposts are excluded. Billed per returned post ("owned reads").
 */
export async function listOwnPosts(
  accessToken: string,
  xUserId: string,
  options: { maxResults?: number; paginationToken?: string } = {},
): Promise<{ posts: XPost[]; nextToken: string | null }> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 20, 5), 100);
  const url = new URL(`${X_API_BASE}/2/users/${encodeURIComponent(xUserId)}/tweets`);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("exclude", "replies,retweets");
  url.searchParams.set("tweet.fields", "created_at,public_metrics");
  if (options.paginationToken) url.searchParams.set("pagination_token", options.paginationToken);

  const body = await xRequest(
    { method: "GET", url: url.toString(), headers: bearer(accessToken) },
    userPostsResponseSchema,
  );
  return {
    posts: body.data.map(toXPost),
    nextToken: body.meta.next_token ?? null,
  };
}

/**
 * GET /2/tweets/:id — one post with its author. Returns null when the post does
 * not exist or is not visible (X answers 200 without `data`, or 404).
 */
export async function getPost(
  accessToken: string,
  postId: string,
): Promise<(XPost & { authorId: string }) | null> {
  const url = new URL(`${X_API_BASE}/2/tweets/${encodeURIComponent(postId)}`);
  url.searchParams.set("tweet.fields", "author_id,created_at,public_metrics");
  try {
    const body = await xRequest(
      { method: "GET", url: url.toString(), headers: bearer(accessToken) },
      postByIdResponseSchema,
    );
    return body.data ? { ...toXPost(body.data), authorId: body.data.author_id } : null;
  } catch (error) {
    if (error instanceof XApiError && error.code === "X_NOT_FOUND") return null;
    throw error;
  }
}

type RawPost = {
  id: string;
  text: string;
  created_at: string;
  public_metrics?:
    | {
        retweet_count: number;
        reply_count: number;
        like_count: number;
        quote_count: number;
        impression_count?: number | undefined;
      }
    | undefined;
};

function toXPost(post: RawPost): XPost {
  return {
    id: post.id,
    text: post.text,
    createdAt: new Date(post.created_at),
    metrics: post.public_metrics
      ? {
          reposts: post.public_metrics.retweet_count,
          replies: post.public_metrics.reply_count,
          likes: post.public_metrics.like_count,
          quotes: post.public_metrics.quote_count,
          impressions: post.public_metrics.impression_count ?? null,
        }
      : null,
  };
}

export type RepostOutcome = "reposted" | "already_reposted";

/**
 * POST /2/users/:id/retweets. X does not allow a double Repost, so an
 * "already reposted" answer means the desired state is reached.
 * UNVERIFIED (D-007): exact X response for a duplicate — both a 200 and an
 * "already …" error are accepted; confirm on the first live test.
 */
export async function repost(
  accessToken: string,
  xUserId: string,
  postId: string,
): Promise<RepostOutcome> {
  try {
    const { data } = await xRequest(
      {
        method: "POST",
        url: `${X_API_BASE}/2/users/${encodeURIComponent(xUserId)}/retweets`,
        headers: { ...bearer(accessToken), "content-type": "application/json" },
        body: JSON.stringify({ tweet_id: postId }),
      },
      repostResponseSchema,
    );
    if (!data.retweeted) throw new XApiError("X_BAD_RESPONSE", 200);
    return "reposted";
  } catch (error) {
    if (isAlreadyReposted(error)) return "already_reposted";
    throw error;
  }
}

/** DELETE /2/users/:id/retweets/:postId — succeeds whether or not a Repost existed. */
export async function undoRepost(
  accessToken: string,
  xUserId: string,
  postId: string,
): Promise<void> {
  await xRequest(
    {
      method: "DELETE",
      url: `${X_API_BASE}/2/users/${encodeURIComponent(xUserId)}/retweets/${encodeURIComponent(postId)}`,
      headers: bearer(accessToken),
    },
    repostResponseSchema,
  );
}

function isAlreadyReposted(error: unknown): boolean {
  return (
    error instanceof XApiError &&
    (error.status === 400 || error.status === 403) &&
    /already (re)?(tweet|post)ed|already reposted/i.test(error.detail ?? "")
  );
}
