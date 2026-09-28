# Security model

What protects the user's X account and credentials, and what must stay true as the app grows. Review this before every deploy and whenever auth, tokens or X calls change.

## 1. What the app never has

- **X password, 2FA codes, Google password.** The user signs in on x.com / accounts.google.com; the app only receives OAuth tokens.
- **Tokens in the browser.** Tokens exist only in server memory during a request and encrypted in Postgres. No `NEXT_PUBLIC_*` variables; the connection view (`src/server/repositories/x-accounts.ts`) never selects token columns. Verified 2026-09-28: no secret values in `.next/static`.

## 2. X OAuth flow (`src/server/services/x-connection.ts`)

| Threat | Control |
|---|---|
| Attacker links their X account to the victim's workspace (OAuth CSRF) | 256-bit random `state`, compared in constant time with the value sealed in the cookie |
| Stolen authorization code | PKCE S256 (verifier never leaves the server/cookie) + confidential client (Basic auth with client secret) |
| State cookie read or forged | AES-256-GCM sealed, `httpOnly`, `SameSite=Lax`, `Secure` on HTTPS, `path=/api/x/oauth`, 10 min TTL, cleared after every callback |
| Callback completed by another signed-in user | State is bound to `userId` + `workspaceId`; mismatch → `session_mismatch`, no X call |
| One X account attached to two workspaces | `xUserId` unique + explicit check → `already_linked` |
| Over-broad access | Scopes limited to `tweet.read tweet.write users.read offline.access`; missing scope → rejected |
| Open redirect | Callback always redirects to `APP_URL/dashboard`; redirect URI fixed in env and exact-matched by X |
| Caching of auth responses | `Cache-Control: no-store` on start/callback |

## 3. Tokens at rest (`src/server/crypto.ts`)

- AES-256-GCM, random 96-bit IV per value, 128-bit tag, versioned keys (`TOKEN_ENCRYPTION_KEYS`, `TOKEN_ENCRYPTION_CURRENT`).
- Each ciphertext is bound to its row via AAD (`x-account:<workspaceId>:access|refresh`): copying a ciphertext into another workspace's row does not decrypt.
- A database dump alone is useless without the key; the key lives only in env (local `.env.local` chmod 600, Vercel encrypted env).
- Refresh tokens rotate; refresh runs under a row lock so two workers can't consume the same single-use token.
- Disconnect deletes tokens and revokes the refresh token at X.

## 4. App login (`src/server/auth/`)

- Google via Better Auth; email/password disabled; allowlist checked on user creation, on every session creation and on every request (`requireWorkspace()`).
- Session cookie `httpOnly`, `SameSite=Lax`, `Secure` on HTTPS; origin check rejects foreign origins; Google OAuth tokens encrypted at rest.
- Server Actions: Next.js enforces same-origin POST.

## 5. Browser hardening (`next.config.ts`)

`X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (no clickjacking), `form-action 'self'`, `base-uri 'self'`, `object-src 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `nosniff`, restrictive `Permissions-Policy`, HSTS in production, no `X-Powered-By`.

## 6. Logging

- Only `src/lib/logger.ts`, only explicit fields (event, workspaceId, error code, HTTP status). `XApiError` messages contain no tokens or response bodies. No `console.*` elsewhere.

## 7. Operational checklist (owner)

- [ ] 2FA on every account that can reach secrets: **GitHub, Vercel, Supabase, X (developer console), Google Cloud**. Their takeover is the realistic way to lose tokens.
- [x] Production gets **new** values for `TOKEN_ENCRYPTION_KEYS`, `AUTH_SECRET`, `CRON_SECRET` — never reuse dev values. Mark them *Sensitive* in Vercel. (Done 2026-09-28 via `pnpm prod:env`, all values stored as Sensitive.)
- [x] Supabase: Data API disabled at creation, automatic RLS on, RLS enabled on all app tables (migration + test), Data API roles revoked (`scripts/supabase-setup.sql`).
- [ ] Never paste secrets into chats, issues, screenshots or commits. `.env*` is gitignored (except `.env.example`).
- [ ] FileVault on (verified 2026-09-28).
- [ ] If a secret may have leaked: regenerate it (X Console → Keys → Regenerate; Google → reset secret), add a new encryption key version and set it current, disconnect/reconnect X.
- [ ] Review connected apps periodically: X → Settings → Security and account access → Apps and sessions.

## 8. Known limits

- The X client secret and encryption key sit in plaintext env on the server — standard for this hosting model; protected by account 2FA and Vercel access control.
- If a token refresh times out after X consumed the refresh token, the account needs a reconnect (shown in the UI).
