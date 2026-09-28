# Implementation Log

Newest entry first. Each entry: what changed, key decisions, verification, limitations, costs, next task.

---

## 2026-09-28 · M2.4 — Repost job processor

**Changed**
- Prisma: `ScheduledRepost` (unique `dedupeKey` per slot occurrence, status PROCESSING/SUCCEEDED/SKIPPED/FAILED/UNKNOWN, lease, snapshot `xPostId`), `RepostAttempt` (UNDO/REPOST/RECHECK with outcome), `RepostSchedule.processingUntil`. Migration `repost_runs`.
- `jobs/process-due-reposts.ts`: stale-run recovery, per-workspace lease, re-plan per occurrence (planner `skipKeys`), guards (connection, dry run, budget, planner skips), undo → Repost → one re-check, UNKNOWN handling, cursor/`lastRepostedAt` updates, deleted post removed from list.
- `POST /api/jobs/run`: Bearer `CRON_SECRET` (constant-time), `no-store`, `maxDuration` 60. `pnpm jobs:run` dev trigger.
- Env: `CRON_SECRET`, `X_WRITES_ENABLED` (default false). UI: dry-run banner, preview aligned with the job (list-only, today's runs), "Recent runs" with statuses and reasons.
- Decision D-014.

**Verification**
- `pnpm check` ✅ — 174 tests (new: planner skipKeys; job happy path with exact X call order, cursor progression, time window/grace, schedule off, exactly-once across calls, concurrent workers, dry run, budget stop, not connected, daily cap across runs, re-check success, UNKNOWN without retry, deleted post, crashed-run recovery, per-workspace credentials, endpoint auth). `pnpm build` ✅.
- Local endpoint call (dry run): `200 {"workspaces":1,…}`, no due occurrence at 15:25 Madrid, no X calls.

**Costs:** $0.

**Next:** M2.5 — deploy (Vercel + Supabase, pg_cron every 5 min, production secrets), then 2.6 history/spend and 2.7 approved live test.

---

## 2026-09-28 · M2.3 — Schedule: dates, daily times per timezone, limits, preview

**Changed**
- Prisma: `RepostSchedule` (one per workspace: active, start date, duration, list cursor), `RepostSlot` (local time + IANA timezone + target PINNED/POST/NEXT_FROM_LIST), workspace `perPostMinIntervalMinutes` (default 240) and `dailyRepostCap` (default 8). Migration `repost_schedule`.
- `lib/zoned-time.ts`: Intl-only wall-clock → UTC with explicit DST rules (gap → after, overlap → earlier) + date helpers.
- `domain/repost-plan.ts`: pure planner — occurrences within the date range, target resolution, list cycling after cursor, per-post interval, daily cap per workspace-local day, skip reasons. Will drive the job processor (M2.4).
- `services/schedule.ts`: page data (preview 48 h, estimate), save schedule, add/remove slots (max 8, own-post check, scoped delete), limits (2–12 h options, cap 1–8).
- UI `/schedule`: dates form (ON/OFF, start, duration / no end), daily times with conversion to Madrid time, add-time form (time, timezone, target incl. specific post), limits & cost projection with over-budget warning, 48 h preview with skip reasons. Posts page uses the interval setting; posts used by a slot are never pruned.
- Decision D-012.

**Verification**
- `pnpm check` ✅ — 158 tests (new: 13 timezone/DST, 12 planner, 11 schedule service incl. cross-workspace slot/post access, 8-slot ceiling, validation, preview + estimate, previous-account post). `pnpm build` ✅.

**Costs:** $0 (no X calls in this task).

**Next:** M2.4 — job processor: materialize planned Reposts, atomic claim + lease, undo → Repost, attempts log, budget/connection guards, UNKNOWN handling.

---

## 2026-09-28 · M2.2 follow-up — media previews, clearer labels, dev Prisma cache fix

- Dev bug: after `prisma generate`, the running dev server kept a cached PrismaClient of the old class (`prisma.ownPost` undefined). `src/server/db.ts` now replaces a cached instance that is not of the current class.
- Posts now request `attachments.media_keys` (+ `type,url,preview_image_url`); first media preview stored (`mediaType`, `mediaPreviewUrl`, `mediaCount`, migration `own_post_media`). Only `https://pbs.twimg.com/` URLs are kept; rendered with `next/image` (remote pattern pbs.twimg.com, unoptimized, no-referrer).
- UI wording: "rotation" → "Repost list"; recent posts show "✓ In repost list" + visible "Remove"; list count in heading.
- Cost reconciliation → D-011 (app $0.055 estimate vs Console $0.03).
- `pnpm check` ✅ (119 tests, new: media mapping + CDN allowlist) · `pnpm build` ✅.

---

## 2026-09-28 · M2.2 — Own posts & Repost rotation UI

**Changed**
- Prisma: `OwnPost` (scoped by workspace + X user id, metrics, pinned flag, rotation flag/position, `lastRepostedAt`); `Workspace.monthlyBudgetMicros` (default $5) and `postsSyncedAt`. Migration `own_posts_and_budget`.
- X: `getPost` (`GET /2/tweets/:id` with `author_id`; 200-without-data or 404 → not found), price `postRead` $0.005 (UNVERIFIED, may bill as owned read).
- Services: `own-posts.ts` — refresh (budget check → atomic 60 s sync claim → 20 recent posts → pinned id → fetch old pinned post if missing), add by link (parse → local lookup → fetch + **own-post check** → append), add/remove/reorder rotation; `budget.ts` (month-to-date spend vs budget, UTC month).
- `lib/post-url.ts` (x.com/twitter.com links or bare id; rejects other hosts), `lib/format.ts`, `domain/repost-rules.ts` (6 h per-post interval, 6/day cap defaults).
- UI `/posts`: month spend vs budget, Repost rotation (order, last reposted, cooldown/ready, ↑ ↓ Remove), add-by-link form, recent posts with metrics (unavailable = “—”), “Refresh from X (≤ $0.035)”; nav links. Server actions validate input with Zod; buttons disable while pending.

**Verification**
- `pnpm check` ✅ — 118 tests (new: URL parsing incl. lookalike hosts; USD/date/count formatting; refresh flow, old pinned post, pin move, rotation preserved, 60 s throttle, concurrent refresh = one X call, budget stop, month boundary, not connected; add by link — local, fetched own, foreign post rejected, missing post ×2, invalid link, idempotent; reorder/remove; cross-workspace edits denied; posts of a previous X account hidden). `pnpm build` ✅.

**Costs:** $0 in tests. One real refresh ≤ $0.035 (20 × $0.001 + $0.010 + maybe $0.005); X deduplicates same-day re-reads.

**Next:** M2.3 — daily slots per timezone, cap and per-post interval settings, preview of the next Reposts.

---

## 2026-09-28 · M2.1 — X client: own posts, Repost, undo Repost

**Changed**
- `integrations/x/client.ts`: `listOwnPosts` (`GET /2/users/:id/tweets`, replies/Reposts excluded, `created_at` + `public_metrics`, 5–100 per page, pagination), `repost` (`POST /2/users/:id/retweets`), `undoRepost` (`DELETE /2/users/:id/retweets/:postId`), `getMe` now also returns `pinned_tweet_id` (same cost).
- Errors: `X_NOT_FOUND`; X problem `detail` kept in memory for matching (never logged). Duplicate Repost ("already …" 400/403) → `already_reposted` success.
- `services/x-api.ts`: `fetchOwnPosts`, `fetchPinnedPostId`, `repostPost`, `undoRepostPost` — resolve credentials, single call (no retries), record estimated cost, map to app errors. Writes that time out / 5xx / malformed → `unknown_outcome` (cost still recorded — X may have billed); reads → `x_unavailable`. 401 → account marked `NEEDS_RECONNECT`, later calls stop before X.
- `x-connection.ts`: `getXCredentials` (token + X user id), `markNeedsReconnect`.
- Pricing constants: owned read $0.001/post, Repost $0.015, undo $0.010 (mapping UNVERIFIED, D-004).
- Test helpers: fake X routes by method/path; `connectXDirectly`.

**Verification**
- `pnpm check` ✅ — 77 tests (21 new: request shape, pagination/clamping, empty timeline, usage rows, rate limit, read vs write failure semantics, duplicate Repost, 404/402/403/429 mapping, 401 → reconnect, per-workspace credential isolation).
- No live X calls in this task.

**Open (UNVERIFIED until 2.7 live test)**
- Exact X response to a duplicate Repost and to undoing a non-existent Repost.
- Whether Repost/undo are billed under "User interactions"/"Interaction deletion".

**Costs:** $0.

**Next:** M2.2 — own posts in the app + Repost queue (pick from list or paste URL).

---

## 2026-09-28 · M1.3 — X OAuth connection

**Changed**
- `src/server/crypto.ts`: AES-256-GCM, versioned key ring (`TOKEN_ENCRYPTION_KEYS`/`_CURRENT`), 16-byte tags, context bound as AAD (`x-account:<workspaceId>:access|refresh`) so ciphertexts can't be moved between rows; rotation via `needsReencryption`.
- Prisma: `XAccount` (one per workspace, `xUserId` unique, encrypted tokens, `CONNECTED`/`NEEDS_RECONNECT`) and `ExternalUsage` (micro-dollars). Migration `x_account_and_usage`.
- X integration (`src/server/integrations/x/`): single-shot HTTP helper (10 s timeout, no retries, typed `XApiError` codes incl. 402/429 reset), Zod response schemas, OAuth 2.0 + PKCE S256 (Basic client auth), `users/me`, estimated pricing.
- `src/server/services/x-connection.ts`: start (state + verifier sealed in an encrypted httpOnly cookie, 10 min TTL, bound to user + workspace), callback checks (denied, state, expiry, session mismatch, required scopes, already linked), usage recording, token refresh under `SELECT … FOR UPDATE`, disconnect with best-effort revoke.
- Routes `/api/x/oauth/start`, `/api/x/oauth/callback`; dashboard X card (connect / connected / needs reconnect / disconnect, error messages); disconnect via server action.

**Decisions**
- Disconnect deletes the `XAccount` row (tokens wiped) so the X account can be reconnected later; key version lives in the ciphertext prefix instead of a separate column.
- Refresh failures: `invalid_grant`/401 → `NEEDS_RECONNECT`; 5xx/network → keep `CONNECTED`, retry later.

**Verification**
- 56 tests pass (new: crypto round-trip/tamper/context/rotation; OAuth start URL; callback success with encrypted storage + PKCE verifier/challenge match + usage row; denied; bad/missing/tampered state; expiry; cross-user callback; already-linked; missing scopes; 402; network; token fresh/refresh/rotation; concurrent refresh = one X call; invalid_grant; 503; cross-workspace token access; disconnect + revoke, revoke failure, isolation, reconnect elsewhere).
- Tests mock X. **Live connect verified** by the user: @eugenebarcelona connected, all 4 scopes granted, tokens stored as `v1:` ciphertexts, access token TTL ≈ 2 h, one `users.me` usage row ($0.010).
- `pnpm check` ✅ · `pnpm build` ✅

**Limitations**
- Refresh token is single-use at X: if a refresh request times out after X consumed it, the next refresh fails and the account needs a reconnect (surfaced in UI).
- Reconnecting a workspace to a different X account does not revoke the previous account's token.

**Costs:** ≈ $0.010 (one `users/me`) — confirm in X Console → Usage.

**Next:** M2.1 — X client for own posts, Repost, undo Repost.

---

## 2026-09-28 · M1.2 — App login & workspace

**Changed**
- Better Auth 1.7.6 with Google (`src/server/auth/auth.ts`), route `src/app/api/auth/[...all]`, client `src/lib/auth-client.ts`. Email/password disabled, telemetry off, Google OAuth tokens encrypted at rest.
- Allowlist (`ALLOWED_EMAILS`) enforced at user creation, at every session creation and in `requireWorkspace()` (existing sessions lose access when an email is removed).
- Prisma: Better Auth core tables + `Workspace` (one per user, `ownerId` unique, cascade delete). Migration `init_auth_workspace`.
- `requireWorkspace()` / `getCurrentUser()` (request-cached) in `src/server/auth/session.ts`; workspace repository with idempotent `ensureWorkspaceForOwner`.
- Pages: `/sign-in` (Google button, error states), `(app)` layout with header + sign out, `/dashboard` placeholder; `/` → `/dashboard`.
- Env: added `APP_URL`; `AUTH_*`, `ALLOWED_EMAILS` validated (allowlist normalized, at least one email).
- Test infra: global setup migrates the test DB (refuses non-test URLs), DB reset helper, sequential files. Seed: two isolated users (dev DB only, idempotent).

**Decisions**
- D-010: Better Auth instead of Auth.js (next-auth v5 still beta).

**Verification**
- `pnpm check` ✅ (typecheck, lint, format, 23 tests: env, allowlist, workspace isolation/idempotency/concurrency/cascade, sign-up + sign-in allowlist hooks) · `pnpm build` ✅
- Dev smoke: `/dashboard` → 307 `/sign-in`; `/sign-in` 200 with button and error message; `get-session` → null; `sign-in/social` returns Google authorize URL.
- Real Google sign-in verified by the user in the browser (dashboard shows own workspace). Fixed: dev server now binds 127.0.0.1; `src/proxy.ts` sends localhost visitors to 127.0.0.1 (Better Auth rejected the localhost origin).

**Limitations**
- UI copy is English for now. No resources besides the workspace yet, so cross-workspace tests cover workspace lookup only; each new resource adds its own IDOR tests.

**Costs:** $0.

**Next:** M1.3 — X OAuth 2.0 (state + PKCE), encrypted token storage, refresh, disconnect. Needs X credits before the first live connection.

---

## 2026-09-28 · M1.1 — Scaffold

**Changed**
- Next.js 16.3 (App Router, `src/`), React 19.2, TypeScript 5.9 strict (+ `noUncheckedIndexedAccess`, `noImplicitOverride`), Tailwind 4.
- ESLint (next core-web-vitals + typescript + prettier; `no-explicit-any`, `no-non-null-assertion`, `consistent-type-imports` as errors), Prettier with Tailwind plugin.
- Vitest 5 (node env, tsconfig paths, `server-only` stub; tests always use `TEST_DATABASE_URL`).
- Prisma 7.10 (`prisma.config.ts` loads `.env.local`; client generated to `src/generated/prisma`, gitignored) + `@prisma/adapter-pg`. Empty schema — models start in M1.2.
- Zod 4 env validation in `src/lib/env.ts` (error lists variable names only, never values) + tests.
- `.env.example` documents all planned variables by milestone; `.env.local` created with local DB URLs (chmod 600).
- `git init` (no commits yet). Default template page/assets replaced with a minimal placeholder.

**Decisions**
- Local Postgres 17 (Homebrew) for dev/tests; Supabase only for production at M2.5.
- Prisma CLI pinned to exact `7.10.0` — `pnpm add prisma` pulled `8.0.0-rc` which mismatched the client.

**Verification**
- `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm format:check` ✅ · `pnpm test` ✅ (4 tests) · `pnpm build` ✅
- `prisma db execute` against `x_manager_dev` ✅. `db:status` exits 1 until the first migration exists (expected).

**Limitations / notes**
- pnpm skipped build scripts for `esbuild`, `workerd` (not needed so far; revisit only if a tool fails).
- Next.js 16 auto-manages the rules block in `AGENTS.md`; `CLAUDE.md` imports it.

**Costs:** $0 (no external calls).

**Next:** M1.2 — Auth.js + Google login with email allowlist, `Workspace`, `requireWorkspace()`, first migration, seed, cross-workspace tests. Needs Google OAuth client credentials from the user.
