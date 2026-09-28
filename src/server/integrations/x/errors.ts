export type XErrorCode =
  | "X_AUTH_EXPIRED" // 401: access token invalid/expired
  | "X_INVALID_GRANT" // OAuth: code/refresh token rejected — user must reconnect
  | "X_FORBIDDEN" // 403: not permitted (scope, suspended app, policy)
  | "X_PAYMENT_REQUIRED" // 402: no credits / spend cap reached
  | "X_RATE_LIMITED" // 429
  | "X_UNAVAILABLE" // 5xx
  | "X_NETWORK" // timeout or connection failure — outcome may be unknown for writes
  | "X_BAD_RESPONSE"; // unexpected status or body shape

export class XApiError extends Error {
  constructor(
    readonly code: XErrorCode,
    readonly status: number | null,
    readonly rateLimitResetAt: Date | null = null,
  ) {
    // Message carries no tokens or response bodies — safe to log.
    super(`X API error ${code}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "XApiError";
  }
}

export function codeForStatus(status: number, oauthError?: string): XErrorCode {
  if (oauthError === "invalid_grant" || oauthError === "invalid_request") return "X_INVALID_GRANT";
  if (status === 401) return "X_AUTH_EXPIRED";
  if (status === 402) return "X_PAYMENT_REQUIRED";
  if (status === 403) return "X_FORBIDDEN";
  if (status === 429) return "X_RATE_LIMITED";
  if (status >= 500) return "X_UNAVAILABLE";
  return "X_BAD_RESPONSE";
}
