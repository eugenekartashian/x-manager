import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import { decrypt, encrypt } from "@/server/crypto";
import { getMe, type XUser } from "@/server/integrations/x/client";
import { XApiError } from "@/server/integrations/x/errors";
import {
  buildAuthorizeUrl,
  createPkce,
  createState,
  exchangeCode,
  hasRequiredScopes,
  refreshAccessToken,
  revokeToken,
} from "@/server/integrations/x/oauth";
import { X_PRICE_MICROS } from "@/server/integrations/x/pricing";
import type { XTokenResponse } from "@/server/integrations/x/schemas";
import { keyRing } from "@/server/keyring";
import { recordUsage } from "@/server/repositories/usage";
import {
  deleteConnection,
  findWorkspaceIdForXUser,
  saveConnection,
  withLockedXAccount,
  type XConnectionView,
} from "@/server/repositories/x-accounts";

export type ConnectionOwner = { userId: string; workspaceId: string };

// ─── OAuth state (sealed into an httpOnly cookie between start and callback) ──

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const STATE_CONTEXT = "x-oauth-state";

const oauthStateSchema = z.object({
  state: z.string().min(1),
  verifier: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  expiresAt: z.number().int(),
});
type OAuthState = z.infer<typeof oauthStateSchema>;

export function startXConnection(
  owner: ConnectionOwner,
  now: Date = new Date(),
  options: { directMessages?: boolean } = {},
): { authorizeUrl: string; sealedState: string } {
  const { verifier, challenge } = createPkce();
  const state = createState();
  const payload: OAuthState = {
    state,
    verifier,
    userId: owner.userId,
    workspaceId: owner.workspaceId,
    expiresAt: now.getTime() + OAUTH_STATE_TTL_MS,
  };
  return {
    authorizeUrl: buildAuthorizeUrl(state, challenge, options),
    sealedState: encrypt(keyRing, JSON.stringify(payload), STATE_CONTEXT),
  };
}

function openOAuthState(sealed: string): OAuthState | null {
  try {
    return oauthStateSchema.parse(JSON.parse(decrypt(keyRing, sealed, STATE_CONTEXT)));
  } catch {
    return null;
  }
}

// ─── Callback ────────────────────────────────────────────────────────────────

export type ConnectError =
  | "denied" // user cancelled on x.com
  | "invalid_state" // missing/forged/mismatched state or cookie
  | "expired" // took longer than OAUTH_STATE_TTL_MS
  | "session_mismatch" // callback reached by a different signed-in user/workspace
  | "missing_scopes" // user unticked a required permission
  | "already_linked" // this X account belongs to another workspace
  | "no_credits" // X returned 402 — top up credits in the X Console
  | "x_unavailable"; // X error/timeout — safe to retry

export type CallbackParams = { code?: string; state?: string; error?: string };

export async function completeXConnection(
  owner: ConnectionOwner,
  params: CallbackParams,
  sealedState: string | undefined,
  now: Date = new Date(),
): Promise<Result<XConnectionView, ConnectError>> {
  if (params.error) return err("denied");

  const saved = sealedState ? openOAuthState(sealedState) : null;
  if (!saved || !params.state || !params.code || !safeEqual(saved.state, params.state)) {
    return err("invalid_state");
  }
  if (saved.expiresAt < now.getTime()) return err("expired");
  if (saved.userId !== owner.userId || saved.workspaceId !== owner.workspaceId) {
    return err("session_mismatch");
  }

  let tokens: XTokenResponse;
  let xUser: XUser;
  try {
    tokens = await exchangeCode(params.code, saved.verifier);
    if (!hasRequiredScopes(tokens.scope)) return err("missing_scopes");
    xUser = await getMe(tokens.access_token);
    await recordUsage({
      workspaceId: owner.workspaceId,
      provider: "X",
      operation: "users.me",
      units: 1,
      unitPriceMicros: X_PRICE_MICROS.userRead,
      resources: { kind: "user", ids: [xUser.id] },
    });
  } catch (error) {
    return err(mapConnectError(error, owner.workspaceId));
  }

  const linkedWorkspace = await findWorkspaceIdForXUser(xUser.id);
  if (linkedWorkspace && linkedWorkspace !== owner.workspaceId) return err("already_linked");

  try {
    const connection = await saveConnection(owner.workspaceId, {
      xUserId: xUser.id,
      username: xUser.username,
      name: xUser.name,
      ...sealTokens(owner.workspaceId, tokens, now),
    });
    logger.info("x.connected", { workspaceId: owner.workspaceId });
    return ok(connection);
  } catch (error) {
    // Unique xUserId: another workspace linked the same X account concurrently.
    if (isUniqueViolation(error)) return err("already_linked");
    throw error;
  }
}

function mapConnectError(error: unknown, workspaceId: string): ConnectError {
  if (!(error instanceof XApiError)) throw error;
  logger.warn("x.connect_failed", { workspaceId, code: error.code, status: error.status });
  if (error.code === "X_PAYMENT_REQUIRED") return "no_credits";
  if (error.code === "X_INVALID_GRANT") return "invalid_state";
  return "x_unavailable";
}

// ─── Access tokens ───────────────────────────────────────────────────────────

/** Refresh when the access token has less than this left. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type TokenError = "not_connected" | "needs_reconnect" | "x_unavailable";

/**
 * Returns a valid access token for the workspace's X account, refreshing it
 * under a row lock when it is about to expire.
 */
export async function getXAccessToken(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Result<string, TokenError>> {
  const result = await getXCredentials(workspaceId, now);
  return result.ok ? ok(result.data.accessToken) : result;
}

export type XCredentials = { accessToken: string; xUserId: string };

/** Access token plus the X user id it belongs to (needed for /2/users/:id/... endpoints). */
export function getXCredentials(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Result<XCredentials, TokenError>> {
  return withLockedXAccount(workspaceId, async (account, tx) => {
    if (!account) return err("not_connected");
    if (account.status === "NEEDS_RECONNECT") return err("needs_reconnect");
    const { xUserId } = account;

    if (account.accessTokenExpiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS) {
      return ok({
        accessToken: decrypt(keyRing, account.accessTokenEnc, tokenContext(workspaceId, "access")),
        xUserId,
      });
    }

    const refreshToken = decrypt(
      keyRing,
      account.refreshTokenEnc,
      tokenContext(workspaceId, "refresh"),
    );
    try {
      const tokens = await refreshAccessToken(refreshToken);
      await tx.xAccount.update({
        where: { id: account.id },
        data: { ...sealTokens(workspaceId, tokens, now), lastRefreshedAt: now },
      });
      return ok({ accessToken: tokens.access_token, xUserId });
    } catch (error) {
      if (!(error instanceof XApiError)) throw error;
      logger.warn("x.refresh_failed", { workspaceId, code: error.code, status: error.status });
      if (error.code === "X_INVALID_GRANT" || error.code === "X_AUTH_EXPIRED") {
        await tx.xAccount.update({
          where: { id: account.id },
          data: { status: "NEEDS_RECONNECT" },
        });
        return err("needs_reconnect");
      }
      return err("x_unavailable");
    }
  });
}

/** Called when X rejects a fresh access token (revoked in X settings). */
export async function markNeedsReconnect(workspaceId: string): Promise<void> {
  await withLockedXAccount(workspaceId, async (account, tx) => {
    if (account)
      await tx.xAccount.update({ where: { id: account.id }, data: { status: "NEEDS_RECONNECT" } });
  });
  logger.warn("x.needs_reconnect", { workspaceId });
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

/** Removes the connection locally, then revokes the token at X (best effort). */
export async function disconnectX(workspaceId: string): Promise<void> {
  const account = await deleteConnection(workspaceId);
  if (!account) return;
  logger.info("x.disconnected", { workspaceId });

  try {
    const refreshToken = decrypt(
      keyRing,
      account.refreshTokenEnc,
      tokenContext(workspaceId, "refresh"),
    );
    await revokeToken(refreshToken, "refresh_token");
  } catch (error) {
    // Local tokens are already gone; the user can also revoke in X settings.
    logger.warn("x.revoke_failed", {
      workspaceId,
      code: error instanceof XApiError ? error.code : "unknown",
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenContext(workspaceId: string, kind: "access" | "refresh"): string {
  return `x-account:${workspaceId}:${kind}`;
}

function sealTokens(workspaceId: string, tokens: XTokenResponse, now: Date) {
  return {
    accessTokenEnc: encrypt(keyRing, tokens.access_token, tokenContext(workspaceId, "access")),
    refreshTokenEnc: encrypt(keyRing, tokens.refresh_token, tokenContext(workspaceId, "refresh")),
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    scopes: tokens.scope,
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
