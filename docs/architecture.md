# Architecture — M1–M2 (Repost scheduler)

Scope: foundation + scheduled Reposts of own posts. Later milestones (reply assistant, metrics, publishing) extend this without changing the core. Decisions referenced as D-xxx live in [decisions.md](decisions.md).

## 1. System diagram

```
 Browser (user)                        Vercel (Next.js App Router)                       External
 ─────────────                         ───────────────────────────                       ────────
 Google sign-in  ───────────────────▶  Better Auth (Google, allowlist) ───────────────▶ Google OAuth
 UI: posts, slots, history  ◀───────▶  Server Components / Route Handlers
                                          │  parse (Zod) → requireWorkspace() → service
 "Connect X"  ──────────────────────▶  /api/x/oauth/start ── state+PKCE ─────────────▶ x.com authorize
                                       /api/x/oauth/callback ◀── code ──────────────── (user signs in to X as usual)
                                          │
                                          ▼
                                       server/services ──▶ server/integrations/x ─────▶ X API v2
                                          │                  (typed client, Zod)       (pay-per-use, $5 cap)
                                          ▼
                                       server/repositories (Prisma, scoped by workspaceId)
                                          │
 Supabase pg_cron (every 5 min)           ▼
   └─ pg_net POST /api/jobs/run ─────▶ jobs/processDueActions(now, batchSize)
      Authorization: Bearer CRON_SECRET        │
                                               ▼
                                       Supabase Postgres
```

Local development: Next.js dev server + local Postgres; the job is triggered manually (`POST /api/jobs/run` or a dev script). X is mocked unless a live test is approved.

## 2. Data model (Prisma draft)

Ownership: `User → Workspace (1:1 for MVP) → XAccount (1:1 for MVP)`. Every user-owned row carries `workspaceId`; repositories always filter by it.

| Model | Key fields | Constraints / indexes |
|---|---|---|
| `User`, `Session`, `Account`, `Verification` | Better Auth core tables (Google login) | `email` unique; `Account` unique (`providerId`, `accountId`) |
| `Workspace` | `ownerId`, `timezone` (IANA), `repostPaused`, `dailyRepostCap` (default 6, max 6), `perPostMinIntervalHours` (default 6), `monthlyBudgetMicros` (default 5_000_000) | `ownerId` unique (MVP) |
| `XAccount` | `workspaceId`, `xUserId`, `username`, `accessTokenEnc`, `refreshTokenEnc`, `tokenKeyVersion`, `accessTokenExpiresAt`, `scopes`, `status` (`CONNECTED` / `NEEDS_RECONNECT` / `DISCONNECTED`) | `workspaceId` unique (MVP); `xUserId` unique (one X account can't be attached to two workspaces) |
| `OwnPost` | `workspaceId`, `xAccountId`, `xPostId`, `text`, `postedAt`, `isPinned`, `lastRepostedAt`, `archived` | unique (`xAccountId`, `xPostId`); index (`workspaceId`, `postedAt`) |
| `RepostSlot` | `workspaceId`, `xAccountId`, `label` ("EU morning"), `localTime` ("09:00"), `timezone` (IANA, per slot), `daysOfWeek` (int[]), `enabled` | index (`workspaceId`) |
| `RepostSlotPost` | `slotId`, `ownPostId`, `position` | unique (`slotId`, `ownPostId`) |
| `ScheduledAction` | `workspaceId`, `xAccountId`, `type` (`REPOST`), `ownPostId`, `slotId?`, `runAt` (UTC), `status`, `leaseUntil`, `attemptCount`, `dedupeKey`, `skipReason?`, `finishedAt?` | unique (`dedupeKey`) = `slotId:ownPostId:localDate`; index (`status`, `runAt`); index (`workspaceId`, `runAt`) |
| `ActionAttempt` | `scheduledActionId`, `workspaceId`, `step` (`UNDO` / `REPOST` / `RECHECK`), `startedAt`, `finishedAt`, `outcome`, `httpStatus?`, `errorCode?` | index (`scheduledActionId`) |
| `ExternalUsage` | `workspaceId`, `xAccountId?`, `provider` (`X` / `AI`), `operation`, `units`, `costMicros` (BigInt), `occurredAt`, `scheduledActionId?` | index (`workspaceId`, `occurredAt`) |

Money: integer micro-dollars (`$0.015` = `15_000`). Times: `timestamptz` UTC; timezones as IANA strings.

## 3. X OAuth & token handling

- **Start** `/api/x/oauth/start` (signed-in user only): generate `state` + PKCE `code_verifier`; store `{state, verifier, userId, workspaceId, exp: 10 min}` in an encrypted, httpOnly, `SameSite=Lax` cookie; redirect to x.com with scopes `tweet.read tweet.write users.read offline.access`.
- **Callback** `/api/x/oauth/callback`: require the same signed-in user as in the cookie; compare `state` (constant-time); exchange code; call `GET /2/users/me` ($0.010, recorded); upsert `XAccount`. If that `xUserId` is already linked to a different workspace → reject with a clear error.
- **Encryption:** AES-256-GCM, random 12-byte IV per value, stored as `v{n}:iv:ciphertext:tag`. Keys from env `TOKEN_ENCRYPTION_KEYS` (`v1:<base64>,v2:<base64>`) + `TOKEN_ENCRYPTION_CURRENT=v2` → rotation by re-encrypting on next refresh.
- **Refresh:** access token ~2 h; refresh when < 5 min left. X refresh tokens are **single-use/rotating**, so refresh runs inside a transaction holding a row lock on `XAccount` (`SELECT … FOR UPDATE`) to avoid two workers burning the same refresh token. Refresh failure → `NEEDS_RECONNECT`, pending actions skipped with reason, UI banner.
- **Disconnect:** revoke token at X (best effort), wipe encrypted tokens, `status = DISCONNECTED`, cancel future `ScheduledAction`s.

## 4. Repost job

`processDueActions(now, batchSize)` — pure service, trigger-agnostic, two phases per run:

1. **Plan** — for each enabled slot, materialize `ScheduledAction`s for the next 24 h (`runAt` computed from `localTime` + slot timezone, DST-safe). Insert with `ON CONFLICT (dedupeKey) DO NOTHING` → idempotent across runs.
2. **Execute** — claim due actions atomically:
   ```sql
   UPDATE "ScheduledAction" SET status='PROCESSING', "leaseUntil"=now()+interval '2 min', "attemptCount"="attemptCount"+1
   WHERE id IN (
     SELECT id FROM "ScheduledAction"
     WHERE (status='SCHEDULED' AND "runAt" <= now())
        OR (status='PROCESSING' AND "leaseUntil" < now())
     ORDER BY "runAt" LIMIT $batch FOR UPDATE SKIP LOCKED)
   RETURNING *;
   ```
   Per action, in order:
   - **Guards** → `SKIPPED` with reason: workspace paused · X not connected · stale (more than 30 min past `runAt`) · daily cap reached · per-post interval not elapsed · budget would be exceeded.
   - Ensure fresh token.
   - **Undo** `DELETE /2/users/:id/retweets/:postId` — always; covers manual reposts the app doesn't know about ($0.010).
   - **Repost** `POST /2/users/:id/retweets` ($0.015).
   - Each call → `ActionAttempt` + `ExternalUsage`.

### States & ambiguous outcomes (D-007)

```
SCHEDULED ──claim──▶ PROCESSING ──▶ SUCCEEDED
    │                    │ ├──────▶ FAILED    (definite error: 4xx auth/forbidden/not found)
    │                    │ ├──────▶ UNKNOWN   (timeout, re-check also inconclusive)
    │                    │ └──────▶ SKIPPED   (guard)
    └──user/disconnect──▶ CANCELLED
```

- Timeout / network error on Repost → one **re-check** (repeat the Repost; "already reposted" = success, because X doesn't allow a double Repost). Still unclear → `UNKNOWN` with a link to the post; no more automatic attempts.
- 429 → back off per `x-rate-limit-reset`, leave the action `SCHEDULED` if it's still within the 30-min window, otherwise `SKIPPED`.
- An expired lease (worker crashed) is safe to reclaim for Reposts because the Repost itself is idempotent.

## 5. Cron endpoint security

`POST /api/jobs/run`: `Authorization: Bearer ${CRON_SECRET}` compared with `crypto.timingSafeEqual`; no body input trusted; `batchSize` fixed server-side; returns counts only. Supabase `pg_cron` every 5 min → `pg_net.http_post`. Precision shown in UI: "± 5 min".

## 6. Folder map

```
src/
  app/
    (app)/            # authenticated pages: dashboard, posts, slots, history, settings
    api/auth/[...nextauth]/route.ts
    api/x/oauth/start/route.ts, callback/route.ts
    api/jobs/run/route.ts
  features/{posts,slots,history,settings}/   # UI components + client hooks
  server/
    auth/        # auth.ts (Better Auth config), session.ts (requireWorkspace), crypto.ts
    services/    # xConnection, ownPosts, slots, reposts, usage
    repositories/
    integrations/x/   # client.ts, schemas.ts, errors.ts, pricing.ts
    jobs/        # processDueActions.ts, planSlots.ts
  lib/           # env.ts (Zod), time.ts, result.ts, logger.ts
prisma/          # schema.prisma, migrations/, seed.ts
tests/           # integration tests (real test DB), fixtures/x/
```

## 7. Now vs deferred

| Now (M1–M2) | Deferred |
|---|---|
| 1 workspace / user, 1 X account / workspace, email allowlist | invites, roles, multiple X accounts |
| Repost slots, undo+repost, guards, budget stop | reply assistant (M3), metrics (M4), publishing (M5) |
| `ExternalUsage` estimates vs $5 cap | AI provider seam, media storage |
| pg_cron + secured endpoint | queues (Redis/BullMQ) — not planned |
| Structured logs without tokens | external monitoring/alerts |
