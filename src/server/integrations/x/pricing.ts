// Estimated X API prices in micro-dollars, from https://docs.x.com/x-api/getting-started/pricing
// (fetched 2026-09-28). Endpoint → price-line mapping is UNVERIFIED — reconcile with
// Console → Usage after live calls (D-004). Same-resource reads within one UTC day are
// deduplicated by X, so read estimates here are an upper bound.
export const X_PRICE_MICROS = {
  userRead: 10_000, // GET /2/users/me — "Users: $0.010 per resource"
  ownedPostRead: 1_000, // GET /2/users/:id/tweets (own) — "Owned reads: $0.001 per resource"
  postRead: 5_000, // GET /2/tweets/:id — "Posts: $0.005 per resource" (may bill as owned read $0.001)
  repost: 15_000, // POST /2/users/:id/retweets — "User interactions: $0.015 per request"
  undoRepost: 10_000, // DELETE /2/users/:id/retweets/:id — "Interaction deletion: $0.010 per request"
  dmSend: 15_000, // POST /2/dm_conversations/with/:id/messages — "DM create: $0.015 per request"
} as const;

export type XBillableOperation = keyof typeof X_PRICE_MICROS;
