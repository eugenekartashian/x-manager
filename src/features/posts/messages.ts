// User-facing text for service errors on the Posts page.
const MESSAGES: Record<string, string> = {
  not_connected: "Connect your X account first.",
  needs_reconnect: "X access expired — reconnect your account on the dashboard.",
  x_unavailable: "X did not respond. Please try again in a minute.",
  rate_limited: "X rate limit reached. Please try again later.",
  no_credits: "X API credits are exhausted. Top up in the X Developer Console.",
  forbidden: "X did not allow this request.",
  not_found: "Post not found — it may have been deleted.",
  unknown_outcome: "X did not confirm the result. Please check on X.",
  too_soon: "Posts were refreshed less than a minute ago.",
  budget_exceeded: "Monthly API budget reached — nothing was requested from X.",
  invalid_url: "Paste a link like https://x.com/you/status/123…",
  not_own_post: "Only your own posts can be added to the repost list.",
  list_full: "The repost list is full (25 posts max — X allows 50 Reposts per 15 minutes).",
};

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}
