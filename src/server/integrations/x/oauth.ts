import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { X_API_BASE, xRequest } from "./http";
import { revokeResponseSchema, tokenResponseSchema, type XTokenResponse } from "./schemas";

// OAuth 2.0 Authorization Code + PKCE (confidential client).
// https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = `${X_API_BASE}/2/oauth2/token`;
const REVOKE_URL = `${X_API_BASE}/2/oauth2/revoke`;

// Minimal scopes: read own profile/posts, Repost, keep access via refresh tokens.
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

export type Pkce = { verifier: string; challenge: string };

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID,
    redirect_uri: env.X_REDIRECT_URI,
    scope: X_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function hasRequiredScopes(granted: string): boolean {
  const scopes = new Set(granted.split(/\s+/));
  return X_SCOPES.every((scope) => scopes.has(scope));
}

export function exchangeCode(code: string, codeVerifier: string): Promise<XTokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.X_REDIRECT_URI,
    code_verifier: codeVerifier,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<XTokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function revokeToken(
  token: string,
  tokenTypeHint: "access_token" | "refresh_token",
): Promise<void> {
  await xRequest(
    {
      method: "POST",
      url: REVOKE_URL,
      headers: formHeaders(),
      body: new URLSearchParams({
        token,
        token_type_hint: tokenTypeHint,
        client_id: env.X_CLIENT_ID,
      }),
    },
    revokeResponseSchema,
  );
}

function tokenRequest(params: Record<string, string>): Promise<XTokenResponse> {
  return xRequest(
    {
      method: "POST",
      url: TOKEN_URL,
      headers: formHeaders(),
      body: new URLSearchParams({ ...params, client_id: env.X_CLIENT_ID }),
    },
    tokenResponseSchema,
  );
}

function formHeaders(): Record<string, string> {
  const basic = Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64");
  return {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Basic ${basic}`,
  };
}
