import { z } from "zod";

export const tokenResponseSchema = z.object({
  token_type: z.string(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string(),
});
export type XTokenResponse = z.infer<typeof tokenResponseSchema>;

export const meResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    name: z.string(),
    pinned_tweet_id: z.string().optional(),
  }),
});

const publicMetricsSchema = z.object({
  retweet_count: z.number().int(),
  reply_count: z.number().int(),
  like_count: z.number().int(),
  quote_count: z.number().int(),
  impression_count: z.number().int().optional(),
});

const attachmentsSchema = z.object({ media_keys: z.array(z.string()).optional() }).optional();

const referencedPostsSchema = z.array(z.object({ type: z.string(), id: z.string() })).optional();

const mediaSchema = z.object({
  media_key: z.string(),
  type: z.string(),
  url: z.string().optional(),
  preview_image_url: z.string().optional(),
});

// Expanded resources: media (own and quoted posts) and the quoted posts themselves.
export const includesSchema = z
  .object({
    media: z.array(mediaSchema).default([]),
    tweets: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
          attachments: attachmentsSchema,
          // Present when requested (creator timelines: the original of a self-Repost).
          author_id: z.string().optional(),
          created_at: z.iso.datetime().optional(),
          public_metrics: publicMetricsSchema.optional(),
        }),
      )
      .default([]),
  })
  .default({ media: [], tweets: [] });

export const userPostsResponseSchema = z.object({
  // X omits `data` entirely when there are no posts.
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string(),
        created_at: z.iso.datetime(),
        public_metrics: publicMetricsSchema.optional(),
        attachments: attachmentsSchema,
        in_reply_to_user_id: z.string().optional(),
        referenced_tweets: referencedPostsSchema,
      }),
    )
    .default([]),
  includes: includesSchema,
  meta: z.object({
    result_count: z.number().int(),
    next_token: z.string().optional(),
  }),
});

export const repostResponseSchema = z.object({
  data: z.object({ retweeted: z.boolean() }),
});

export const dmSendResponseSchema = z.object({
  data: z.object({ dm_conversation_id: z.string(), dm_event_id: z.string() }),
});

export const revokeResponseSchema = z.object({ revoked: z.boolean() });

export const postByIdResponseSchema = z.object({
  // Missing/deleted posts may come back as 200 with only `errors`.
  data: z
    .object({
      id: z.string().min(1),
      text: z.string(),
      author_id: z.string().min(1),
      created_at: z.iso.datetime(),
      public_metrics: publicMetricsSchema.optional(),
      attachments: attachmentsSchema,
      referenced_tweets: referencedPostsSchema,
    })
    .optional(),
  includes: includesSchema,
});

export const usersByResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        username: z.string().min(1),
        name: z.string(),
        description: z.string().optional(),
        profile_image_url: z.string().optional(),
        verified: z.boolean().optional(),
        // Relation to the authenticated user, e.g. ["followed_by", "following"].
        connection_status: z.array(z.string()).optional(),
        public_metrics: z
          .object({
            followers_count: z.number().int(),
            following_count: z.number().int(),
            tweet_count: z.number().int(),
          })
          .optional(),
      }),
    )
    .default([]),
});

/** GET /2/tweets/search/recent — only the fields the repost check needs. */
export const recentSearchResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        created_at: z.iso.datetime().optional(),
        referenced_tweets: referencedPostsSchema,
      }),
    )
    .default([]),
});
