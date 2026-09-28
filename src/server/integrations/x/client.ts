import "server-only";
import { XApiError } from "./errors";
import { X_API_BASE, xRequest } from "./http";
import {
  meResponseSchema,
  postByIdResponseSchema,
  usersByResponseSchema,
  repostResponseSchema,
  userPostsResponseSchema,
} from "./schemas";

// Typed X API v2 calls. Pure protocol: no database, no cost accounting — see
// src/server/services/x-api.ts for the workspace-aware wrapper.

export type XUser = { id: string; username: string; name: string; pinnedPostId: string | null };

export type XPostMedia = { type: string; previewUrl: string | null; count: number };

export type XPost = {
  id: string;
  text: string;
  createdAt: Date;
  media: XPostMedia | null;
  isQuote: boolean;
  /** Text of the quoted post (Quote posts only). */
  quotedText: string | null;
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
): Promise<{
  posts: XPost[];
  nextToken: string | null;
  /** Every post X returned (incl. filtered replies) — all of them are billed. */
  billedPostIds: string[];
  /** Quoted posts, returned as expanded resources and billed as Post reads. */
  quotedPostIds: string[];
}> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 20, 5), 100);
  const url = new URL(`${X_API_BASE}/2/users/${encodeURIComponent(xUserId)}/tweets`);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("exclude", "replies,retweets");
  url.searchParams.set(
    "tweet.fields",
    "created_at,public_metrics,attachments,in_reply_to_user_id,referenced_tweets",
  );
  setMediaParams(url);
  if (options.paginationToken) url.searchParams.set("pagination_token", options.paginationToken);

  const body = await xRequest(
    { method: "GET", url: url.toString(), headers: bearer(accessToken) },
    userPostsResponseSchema,
  );
  return {
    // `exclude=replies` still returns replies to one's own posts (e.g. a link left
    // under a post); those are comments, not Repost candidates.
    posts: body.data.filter((post) => !isReply(post)).map((post) => toXPost(post, body.includes)),
    nextToken: body.meta.next_token ?? null,
    billedPostIds: body.data.map((post) => post.id),
    quotedPostIds: body.includes.tweets.map((post) => post.id),
  };
}

/**
 * GET /2/tweets/:id — one post with its author. Returns null when the post does
 * not exist or is not visible (X answers 200 without `data`, or 404).
 */
export async function getPost(
  accessToken: string,
  postId: string,
): Promise<(XPost & { authorId: string; quotedPostIds: string[] }) | null> {
  const url = new URL(`${X_API_BASE}/2/tweets/${encodeURIComponent(postId)}`);
  url.searchParams.set(
    "tweet.fields",
    "author_id,created_at,public_metrics,attachments,referenced_tweets",
  );
  setMediaParams(url);
  try {
    const body = await xRequest(
      { method: "GET", url: url.toString(), headers: bearer(accessToken) },
      postByIdResponseSchema,
    );
    return body.data
      ? {
          ...toXPost(body.data, body.includes),
          authorId: body.data.author_id,
          quotedPostIds: body.includes.tweets.map((post) => post.id),
        }
      : null;
  } catch (error) {
    if (error instanceof XApiError && error.code === "X_NOT_FOUND") return null;
    throw error;
  }
}

type RawMedia = {
  media_key: string;
  type: string;
  url?: string | undefined;
  preview_image_url?: string | undefined;
};

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
  attachments?: { media_keys?: string[] | undefined } | undefined;
  referenced_tweets?: { type: string; id: string }[] | undefined;
};

type RawIncludes = {
  media: RawMedia[];
  tweets: {
    id: string;
    text: string;
    attachments?: { media_keys?: string[] | undefined } | undefined;
  }[];
};

function isReply(post: {
  in_reply_to_user_id?: string | undefined;
  referenced_tweets?: { type: string }[] | undefined;
}): boolean {
  return (
    post.in_reply_to_user_id !== undefined ||
    (post.referenced_tweets ?? []).some((ref) => ref.type === "replied_to")
  );
}

// Media URLs come from X and are rendered in our pages: accept X's image CDN only.
const MEDIA_HOST = "https://pbs.twimg.com/";

function safeMediaUrl(value: string | undefined): string | null {
  return value && value.startsWith(MEDIA_HOST) ? value : null;
}

function setMediaParams(url: URL): void {
  url.searchParams.set(
    "expansions",
    "attachments.media_keys,referenced_tweets.id,referenced_tweets.id.attachments.media_keys",
  );
  url.searchParams.set("media.fields", "type,url,preview_image_url");
}

function toXPost(post: RawPost, includes: RawIncludes): XPost {
  const quotedId = post.referenced_tweets?.find((ref) => ref.type === "quoted")?.id;
  const quoted = quotedId ? includes.tweets.find((item) => item.id === quotedId) : undefined;
  // A Quote post usually has no media of its own — preview the quoted post's media.
  const ownKeys = post.attachments?.media_keys ?? [];
  const keys = ownKeys.length > 0 ? ownKeys : (quoted?.attachments?.media_keys ?? []);
  const first = includes.media.find((item) => item.media_key === keys[0]);
  return {
    id: post.id,
    text: post.text,
    createdAt: new Date(post.created_at),
    isQuote: quotedId !== undefined,
    quotedText: quoted?.text ?? null,
    media:
      keys.length > 0
        ? {
            type: first?.type ?? "photo",
            previewUrl: safeMediaUrl(
              first?.type === "photo" ? first.url : first?.preview_image_url,
            ),
            count: keys.length,
          }
        : null,
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

export type XProfile = {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean;
  followers: number | null;
  following: number | null;
  posts: number | null;
};

/**
 * GET /2/users/by — up to 100 public profiles by @handle. Billed per returned user.
 * Handles that don't exist (or are suspended) are simply missing from the result.
 */
export async function getUsersByUsernames(
  accessToken: string,
  usernames: string[],
): Promise<XProfile[]> {
  if (usernames.length === 0) return [];
  if (usernames.length > 100) throw new Error("At most 100 usernames per lookup");
  const url = new URL(`${X_API_BASE}/2/users/by`);
  url.searchParams.set("usernames", usernames.join(","));
  url.searchParams.set("user.fields", "description,profile_image_url,public_metrics,verified");
  const body = await xRequest(
    { method: "GET", url: url.toString(), headers: bearer(accessToken) },
    usersByResponseSchema,
  );
  return body.data.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    bio: user.description || null,
    avatarUrl: safeMediaUrl(user.profile_image_url),
    verified: user.verified ?? false,
    followers: user.public_metrics?.followers_count ?? null,
    following: user.public_metrics?.following_count ?? null,
    posts: user.public_metrics?.tweet_count ?? null,
  }));
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
