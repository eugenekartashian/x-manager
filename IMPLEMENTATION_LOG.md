# Implementation Log

Newest entry first. Each entry: what changed, key decisions, verification, limitations, costs, next task.

---

## 2026-09-29 · M3.4 — AI reply ideas + configurable reply limits

- `integrations/ai/claude.ts` (Claude Opus 5 via `@anthropic-ai/sdk` 0.129, low effort, JSON-schema output, `fallbacks: "default"`, no tools, untrusted-data delimiting), `integrations/ai/pricing.ts`, `services/ai-replies.ts` (scoped to loaded posts of own targets, budget + 100/day cap, refusal → no spend, errors → retryable message). "✨ AI ideas" in the reply composer; ideas are one-click fillers for the text box.
- Reply limits configurable (migration `reply_limits_settings`: `replyCooldownHours`, `replyDailyLimit`), form on /targets. Target posts: fetch 10, keep 5 originals (fixes "Loaded 0" for accounts whose latest items are replies/Reposts).
- Env: `ANTHROPIC_API_KEY` (optional, empty = off), `AI_MODEL`; `pnpm prod:env` pushes optional vars only when set. Decision D-021.
- `pnpm check` ✅ — 218 tests (new: 6 AI incl. request shape/headers, no tools, cost, invalid output, refusal, isolation, budget + daily cap, API error; reply limits settings; 10→5 posts). `pnpm build` ✅. Production migrated before deploy.

- Follow-up (D-022): provider seam `integrations/ai/{reply-ideas,claude,openai,index}.ts`; OpenAI Responses API (`gpt-5-mini`, strict JSON schema, low reasoning effort) is the default; Claude stays selectable. Snapshot-aware pricing (`gpt-5-mini-2025-08-07` → gpt-5-mini). 3 more tests (OpenAI request shape + cost, refusal, missing key).

- OpenAI key set locally and in Vercel (Sensitive), redeployed; smoke test OK; first live AI ideas cost 556 micros.
- Reply session freshness (2026-09-29): posts show age ("3 h ago") and a `fresh` (< 24 h) / `old` label — heuristic, X publishes no post lifetime; old posts are labelled, not hidden. When X returns no original posts (account only replies/reposts lately), the page says so instead of "Loaded 0 posts". Deliberately no deeper pagination and no Reposts: replies only matter under the target's fresh own posts (a reply to a Repost lands under the original author).

---

## 2026-09-28 · M3.2–3.3 — Reply templates & reply session

- Models `ReplyTemplate`, `TargetPost`, `ReplyLog` (OPENED/UNDONE), `TargetAccount.postsFetchedAt` (RLS on all). Migration `reply_assistant`.
- `domain/reply-rules.ts`: 1 reply per account per 24 h, 15 per workspace-local day, 280-char guard, X composer intent URL (`x.com/intent/post?in_reply_to=…&text=…`).
- Services: templates (≤ 50, ≤ 280 chars), load a target's latest 5 posts (throttled 10 min, budget-checked, billed as Post reads with day dedup), `openReply` (only loaded posts of the caller's own targets; limits enforced server-side; logs + marks account), `undoReply` (frees the slot, restores last reply time).
- UI: templates section and recent replies (Undo) on `/targets`; "Reply →" per account; `/targets/[id]` session — profile, today's counter, load posts, per-post composer (random template, "another template", counter, "Open in X ↗" opened synchronously to avoid popup blockers), block reasons, replies to this account.
- `pnpm check` ✅ — 209 tests (new: 4 rules, 7 service: templates isolation, posts load/billing/throttle, intent URL + log, 24 h per account, 15/day + next-day reset, only loaded posts / cross-workspace denied, undo). `pnpm build` ✅. Production migrated before deploy.

**Not covered:** the app cannot verify that the user actually posted (X composer is outside the app) — Undo keeps counts honest.

---

## 2026-09-28 · M3.1 — Target list

- `TargetAccount` (RLS on), `GET /2/users/by` client (`lookupUsers`, billed per returned user with day dedup), handle parser (@handle, x.com/twitter.com links, Excel columns; invalid reported), service: add (skip already listed without an X call, exclude own account, budget check, ≤ 100 per add, ≤ 500 total), notes (≤ 200), remove, list sorting, CSV export with formula-injection guard + UTF-8 BOM.
- `/targets` page (connect-gated) with add form, list (avatar, followers, bio, note, last replied), sort, Export CSV; `/api/targets/export` (session-scoped, no-store). Nav: Targets. Decision D-020.
- `pnpm check` ✅ — 198 tests (new: 4 parser, 10 targets incl. cross-workspace edits, dedup/no-call for existing, self skip, budget stop, CSV injection). `pnpm build` ✅. Production migrated before deploy.

---

## 2026-09-28 · M2.6 — History & real spend

- `billed_resource` table (RLS on) + `external_usage.billedUnits`; `recordUsage` bills read resources once per UTC day (D-019). Filtered replies are now counted (X bills them). Migration `billed_resources` (existing rows: billedUnits = units).
- `/history`: month counters (reposted / skipped / failed / check on X), spend by operation with budget bar, runs list with All / Reposted / Problems filters, monthly budget form ($1–$500, whole cents).
- App-wide budget banner at ≥ 80% (warning) and 100% (Reposts paused). Nav: History.
- Commercial-version considerations recorded in ROADMAP ("Future").
- `pnpm check` ✅ — 184 tests (new: per-day dedup incl. day boundary, per-workspace dedup, writes per request, filtered replies billed, budget levels, budget validation, history filters + month counts + workspace isolation). `pnpm build` ✅. Production migrated before deploy.

**Costs:** $0.

**Next (user choice):** M3 reply assistant, M4 measurement, or M6 friend beta.

---

## 2026-09-28 · D-018 — no daily cap, 2 h interval, list ≤ 25 (deployed)

- Per-post daily cap removed (planner, processor, service, UI; migration drops `workspace.dailyRepostCap`, default interval 120 min). Only limits: ≤ 8 daily times, per-post interval (2–12 h), repost list ≤ 25 (X API: 50 Reposts / 15 min per user), monthly budget.
- Safe rollout of the batch model mid-window: inserted `SKIPPED: model_change` placeholder runs for today's 16:40 batch so the new dedupe keys could not re-run it; pushed at 17:02, deploy Ready, then `prod:migrate`, then production interval set to 120 min.
- `pnpm check` ✅ (177 tests). Cron 17:05 → 200, no unexpected runs (schedule is OFF by the user).

---

## 2026-09-28 · Batch model — whole list at every time (D-017)

- Planner rewritten: each daily time yields one Repost per listed post (bottom → top), per-post interval and daily cap, empty-list skip; dead pinned/specific/cursor logic removed.
- Processor: pause between Reposts (1.5 s), 45 s time budget with continuation on the next call, 60-item safety bound; list cursor no longer updated.
- UI: preview grouped per time ("N of M to repost"), slot rows "Repost list · reposts all N posts", warning when times are closer than the interval, updated copy on Posts/Schedule; estimate = min(times × posts, daily cap).
- `pnpm check` ✅ — 177 tests (planner rewritten; processor: batch order, repeat per time, pause, time-budget continuation, per-post exactly-once incl. concurrency, cap, empty list, deleted post mid-batch).

---

## 2026-09-28 · M2.7 — Live test + quote previews

- Quote posts: `Quote` badge, preview of the quoted post's media and text (expansion `referenced_tweets.id`), quoted reads billed as Post reads; budget guard uses worst case per refresh. Migrations `own_post_quote`, `own_post_quoted_text` (applied to production first).
- Schedule page requires a connected X account (shared `ConnectXFirst`).
- `pnpm prod:env NAME…` pushes selected variables. `X_WRITES_ENABLED=true` in production (user-approved).
- **Live test passed** (D-016): 16:40 Madrid slot reposted the pinned post; UNDO + REPOST both 200; Console −$0.02 (rounded), consistent with estimate.
- `pnpm check` ✅ (176 tests).

**Open:** user to choose "one post per time" vs "whole list per time" (batch) mode; slot 16:40 will repost the next list post tomorrow.

---

## 2026-09-28 · M2.5 — Deploy (Vercel + Supabase + pg_cron)

**Changed**
- RLS enabled on all tables (migration `enable_rls`) + guard test; `scripts/supabase-setup.sql` (Data API lockdown, Vault secret, pg_cron); `scripts/prod.mts` (`prod:migrate`, `prod:setup`, `prod:env`); `vercel.json` region fra1.
- Supabase project (Frankfurt, Data API off, automatic RLS on); 8 migrations applied; setup SQL run.
- Vercel project linked to GitHub, domain x-manager-ek.vercel.app, 13 env vars as Sensitive, production deploy via git push.
- Decision D-015.

**Verification**
- `pnpm check` ✅ (175 tests) · Vercel build ✅.
- Production smoke: `/sign-in` 200, `/dashboard` → 307 `/sign-in`, `/api/jobs/run` 401 without secret / 405 on GET, HSTS + CSP frame-ancestors + X-Frame-Options present, Google `redirect_uri` uses the production domain.
- pg_cron first run: HTTP 200 `{"workspaces":0,…}` (dry-run mode, no users yet).

**Pending (user):** add production callback URLs in Google Cloud and X Developer Console; sign in on production and redo setup (connect X, refresh posts, list, schedule) — production DB is separate from local.

**Costs:** $0 (hosting free tiers; no X calls).

**Next:** 2.6 history & real spend (per-day dedup), then 2.7 approved live test (`X_WRITES_ENABLED=true`).

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

### 2026-09-29 — Repost order + target export dates

- D-023: a batch now reposts in list order (#1 first); the last post ends on top of the timeline. Planner, preview and copy updated; tests updated.
- Targets CSV export: added `stats_as_of` (when followers/following/posts were looked up) and `added_at`.

### 2026-09-29 — UI polish

- Targets CSV: dates as `YYYY-MM-DD HH:MM` in the workspace timezone (Excel recognises them), no seconds/`Z`.
- Mobile: header collapses to a burger menu at ≤ 768 px (inline from 769 px) (links, email, sign out); current page highlighted (`aria-current`). Not checked on a real phone yet.
- Dashboard content plan recorded in `docs/ROADMAP.md`.

- Posts page (mobile): list items now stack — post content full width, footer row with position badge, status and actions (↑/↓ as 40 px icon buttons, disabled at the ends; Remove as a quiet text button). Recent posts use the same footer.

### 2026-09-30 · M6.1 — Roles & access in the DB (D-025)

- Migration `access_invites_and_roles`: `UserRole` enum + `user.role`, `access_invite` table (RLS on), backfill of invites for existing users.
- `services/access.ts`: `hasAppAccess`, `resolveAccess` (role sync), `inviteUser`, `revokeAccess` (sessions deleted, schedule paused). Auth hooks and `requireWorkspace()` use it; new `requireSuperadmin()`.
- Env: `ALLOWED_EMAILS` → `SUPERADMIN_EMAILS` (local, production, Vercel, `.env.example`, `prod:env`).
- Tests: 10 new (invites, revoke isolation, role sync/demotion, hooks). 240 passing.
- Rollout order: `SUPERADMIN_EMAILS` to Vercel → `prod:migrate` → push.

### 2026-09-30 · M6.2 — Admin page

- `/admin` (superadmin only, 404 for others; "Admin" nav item only for the superadmin): total month spend across users, invite by Google email, user list (status superadmin / active / invited / revoked / no access, X account + reconnect state, month spend vs budget, joined, last active), two-step "Revoke access".
- `repositories/admin.ts` (bounded cross-workspace reads) + `services/admin.ts` (`listMembers`, merge by normalized email). 2 new tests; 242 passing.
- Old `ALLOWED_EMAILS` removed from Vercel.

### 2026-09-30 · M6.3a — Per-user limits (D-026)

- Migration `user_limits`: limit columns + switches on `workspace`, default budget $10 for new workspaces, `feature_usage` table (RLS on).
- `domain/user-limits.ts` (bounds, `capToLimits`), `services/limits.ts` (`getLimits`, daily usage, `saveUserLimits`). Enforced in own-posts, schedule, targets, replies, AI and the Repost job/preview.
- `/admin`: limits summary + "Edit limits" per user (numbers, Targets/AI switches, monthly budget).
- Tests: 11 new (caps, daily reset in Madrid time, switches, superadmin unlimited, validation); budget tests moved to the $10 default. 253 passing.

### 2026-09-30 · M6.3b — User UI without prices + global cap

- Prices hidden for users on the budget banner (only "limit reached"), Posts, Schedule, History (no spend section / budget form), Targets, reply session (load button, AI tooltip). Counters: list n/cap, daily times n/cap, targets n/cap, "Loads left today", "AI ideas left today for @x". Targets pages show "not enabled" when switched off.
- Security: `saveBudgetAction` is superadmin-only (users can't raise their own budget).
- Optional `GLOBAL_MONTHLY_BUDGET_USD` (env) + shown on /admin. Tests: 255 passing.

### 2026-09-30 · M6.3c — Simpler settings for users (D-027)

- Interval form and Reply limits form hidden for users; `saveIntervalAction` / `saveReplyLimitsAction` superadmin-only.
- Users: fixed 1 h per-post interval in the job, preview and copy; adding a time < 1 h from another is refused ("Times must be at least 1 hour apart."). 257 tests passing.
- Default user limits → 2 posts × 4 times (migration `user_limits_2_posts_4_times`, moves users still on 4 × 2). Max-usage cost table added to ROADMAP.

### 2026-09-30 · M6.4 (1–2) — Parallel Repost job + load test

- Job: one deadline for the whole invocation (45 s; the platform stops at 60 s — previously the budget was per workspace, so many users could overrun), up to 8 workspaces in parallel, up to 200 per call (least recently processed first). Leases + unique dedupe keys unchanged.
- Capacity estimate: a user batch (2 posts) ≈ 5–7 s with real X latency and the 1.5 s pause → ≈ 50–70 users per call; the scheduler runs every 5 min within a 30 min grace window → ≈ 300+ users with the same minute, more when times differ.
- `tests/integration/load.test.ts`: 200 users × 2 posts due at once — two overlapping calls repost each post exactly once (≈ 1.6 s with fake X); short deadlines split work across calls with no duplicates or gaps.

### 2026-09-30 · M6.4 (3) — Security audit

- Revoking a user's access now also deletes their X tokens and revokes them at X (test added).
- `tests/integration/isolation.test.ts`: cross-workspace audit for targets, notes, export, reply session, loads, replies, undo, templates, AI, history, token use.
- Script check: every server action authorizes first. Dependency advisories (Prisma CLI transitive: lodash, mysql2, deepmerge-ts) fixed via pnpm overrides; `pnpm audit --prod` clean.
- Findings and residual risks in `docs/security.md` → "Audit 2026-09-30". 265 tests passing.

### 2026-09-30 · M6.4 (4) — Sentry (D-028)

- `src/lib/sentry-options.ts` (shared privacy settings + scrubbers), `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.{server,edge}.config.ts`, `src/app/global-error.tsx`, `withSentryConfig` in `next.config.ts`. Env: `NEXT_PUBLIC_SENTRY_DSN` (+ optional `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`), added to `prod:env`.
- Off until the DSN is set. 268 tests passing.
- Sentry live in production (DSN via `pnpm prod:env`, public `NEXT_PUBLIC_*` values pushed as `--type config`); test error from `/api/admin/sentry-test` (superadmin only) received in Sentry.

### 2026-09-30 · M6.5 — Privacy, Terms, account deletion (D-029)

- `/privacy`, `/terms` (public), links on sign-in + app footer; `LEGAL_CONTACT_EMAIL` (optional env).
- `services/account.ts` `deleteMyAccount`: X revoke + delete user/invite, cascade verified for all 12 workspace tables (`tests/integration/account.test.ts`); superadmin refused. Dashboard "Delete account" section (type DELETE). 270 tests passing.

### 2026-09-30 · M6.6 prep — X multi-user rules (D-030) + header

- Consent to automated Reposts (migration `repost_consent`, form checkbox, job filter, tests); "not affiliated with X Corp." disclaimer; daily-safe purge of target posts older than 3 days in `/api/jobs/run` (test).
- Header: account menu (initial → email, Admin for superadmin, Sign out); Admin removed from the main nav.
- 273 tests passing.

### 2026-09-30 · Dashboard v1 + admin targets export

- Dashboard: needs-attention (X connection, failed/unknown Reposts in 24 h, usage limit, schedule on without list/times), next batch + last batch result, today (replies n/limit, target loads, AI requests; spend for superadmin), 14-day bar charts (Reposts by outcome, replies; spend for superadmin) in plain CSS with an sr-only table, recent 5 runs → History, X card, delete account. Only stored data, no X/AI calls.
- `repositories/dashboard.ts` (per-day aggregates in the workspace timezone, scoped by workspace), `services/dashboard.ts`; 3 tests (local-day bucketing, money hidden for users, isolation).
- `/admin`: aggregated targets CSV (D-031). 277 tests passing.

- Schedule default: new schedules start as a 1-day run ("No end date" unticked); unused, off schedules without an end date migrated to 1 day (`schedule_default_one_day`).

### 2026-09-30 · M3.5 (part 1) — Quick add from X (share)

- `/targets/add?url|text|title=…`: `handleFromShared` (profile / post links, @mentions; ignores x.com/i/…, search, etc.) → "Add @handle to targets" → opens the reply session; already-listed accounts open directly. GET only shows a button; the add is a server action.
- Android: installable PWA (`app/manifest.ts` with `share_target` → /targets/add, generated icons `/pwa-icon/192|512`, `apple-icon`). iPhone: Shortcut instructions (URL Encode → Text → Open URLs). Desktop: bookmarklet (sends only location.href).
- Targets page: "Quick add from X" help. 289 tests passing. Not yet verified on real devices.

### 2026-10-01 · Landing page + access requests (D-032)

- `src/app/page.tsx` + `src/features/landing/*` (Reveal, Parallax, RequestForm, CSS mock-ups); migration `access_requests`; `services/access-requests.ts` (3 tests); admin section with Invite / Dismiss.
- Checked with Playwright screenshots (desktop 1280, mobile 390) against a local production build. 292 tests passing.

### 2026-10-09 · M7.0 — Price & ordering check (live, user-approved)

- Timeline read of @john_gerk87 (24 h, max 20): HTTP 200, 20 Reposts + more pages → $0.10; Console showed $0.10 for 9 Oct.
- `retweeted_by` on the pinned post (max 10) twice, with the owner re-reposting in between: owner moved from #2 to #1 → newest-first confirmed; the repeat was within the same UTC day (deduplicated).
- Decision: incremental per-post check for 7.3 (D-033). Console balance at the time: $2.98 — top-up needed to keep scheduled Reposts running.

### 2026-10-09 · M7.1 — Creators table (Collab CRM)

- Migration `creators_crm`: `target_account.status` (NEW / CONTACTED / REPOSTED / PARTNER / DECLINED / NO_REPLY), `tags text[]`, `source` (MANUAL / IMPORT / SHARE / DISCOVERY), `lastContactAt`, index (workspaceId, status).
- `services/creators.ts`: URL filters parsed with fallbacks, paging (50), counts per status, tag list, bulk status / tag / remove (≤ 100, scoped by workspace). Adds record their source.
- UI: nav "Creators" (route stays /targets); status tabs with counts, search, tag filter, sort, pagination; table on desktop, cards on mobile; selection → set status, ±tag, remove (no bulk messaging); import .xlsx/.csv in the browser (`read-excel-file`, new dependency approved) in batches of 100 — existing accounts skipped before any X lookup; note + remove moved to the creator page; templates/limits collapsed.
- Tests: `creators.test.ts` (filters, paging, bulk, normalised tags, sources, isolation). 303 passing. UI not checked on a device yet.

- 7.1 follow-up: 25 rows per page; floating bottom action bar (Move to… / + Label / Remove), labels shown under the name, fewer columns; status/label explanation on the page; labels removable on the creator page.

### 2026-10-09 · M7.2 — Creator card & outreach

- Migration `collab_outreach`: `creator_event` (MESSAGE_OPENED / STATUS_CHANGED, text, postUrl, previous status, undoneAt; RLS on), `workspace.limitMessagesPerDay` (default 30 — user decision, applies to everyone), FeatureKind `AI_MESSAGE`.
- AI seam generalised: providers run a `JsonTask` (system, user, schema) and features validate with their own Zod schema; reply ideas unchanged (existing tests pass). New `collab-messages.ts` prompt: 3 different personal DMs, untrusted data in tags, no explicit content, no payment/follower promises.
- `services/outreach.ts`: `openMessage` (validates text/post link, daily limit per local day, records event, NEW/NO_REPLY/DECLINED → Messaged, stamps last contact, returns `x.com/messages/compose?recipient_id&text` — mobile behaviour UNVERIFIED, UI offers Copy text + Open profile), undo within 24 h (restores status, frees the slot), manual status change with history, AI drafts (per-creator daily cap for users, budget check, usage recorded).
- Creator page: status select, labels, note; "Message" (own post picker from the repost list/recent posts or a pasted link, AI drafts, Open in X, Copy text, n/30 today); History.
- Tests: outreach rules + `outreach.test.ts` (validation, limit/reset, undo window, partners stay, isolation, AI prompt/usage/cap). 317 passing.
- 7.2 follow-up (2026-10-09): X's DM link opens the chat but does **not** prefill text (verified by the user on desktop) → "Copy & open chat" copies the text in the click, then asks "Did you send it?" (Yes / No — undo). Post links use the owner's username. Creator `role` (Top / Bottom / Vers; migration `creator_role`): filter, bulk "Role…", card select. Table: 4 columns, names never truncated (wrap), labels + last contact under the name. 318 tests passing.
- 7.2 follow-up: synchronous copy (hidden textarea + execCommand) before opening the X chat — the async Clipboard API failed once the new tab took focus; verified in Chromium with Playwright (copy then window.open → clipboard has the text). Status and role save on change (AutoSaveSelect, "Saved ✓"); all new selects use the shared Select component.
- 7.2 follow-up 2: direct X Chat link (`chatUrl`, ids compared as BigInt); "Copy & open chat" records nothing — `recordSentMessage` runs on "✓ Yes, sent" ("Not yet" leaves no trace; "Undo" after saving); undone events hidden from history; popup-blocked fallback link instead of navigating away. 319 tests passing.
- 7.2 follow-up 3: "Copy & open chat" saves the message as sent immediately (user decision); undo in the panel and in History (24 h). Test history of @john_gerk87 removed in production on the user's request (11 events, status back to New).

### 2026-10-10 · M7.3 — Repost checks ("Promote a post")

- Migration `repost_checks`: `promoted_post_check` (seen reposter ids newest-first, checkedAt; RLS on), `target_account.theyRepostedAt / repostedBackAt`, FeatureKind `REPOST_CHECK`.
- X client `getReposters` (Zod), `fetchReposters` (userRead usage, per-day dedup); `domain/repost-check-rules.ts` (scan/merge, tested); `services/repost-checks.ts` (own posts only, budget guard, incremental scan, auto "Reposted", daily job in `/api/jobs/run` + "No reply" after 3 days, "Check now", "I reposted back"); owed filter `?owed=1`.
- UI: overview panel on Creators (waiting for them / for you, last check, Check now), green "reposted your post" panel on the creator page.
- Phones: X app chat link (user-verified). 332 tests passing.
- 7.3 follow-up: the chosen post link is appended to the message when the text doesn't contain it (copy, app link, history) — hand-written texts lost the link before.
- 7.3 follow-up: first check of a post reads at most 2 pages (≈ 40 users ≈ $0.40) instead of 5 — messaged creators repost after the message, i.e. on top.
- 7.3 follow-up (incident): auto check of the pinned post cost ≈ $0.89 (100 reposters) — automatic checks paused, then moved to a daily 09:00 (workspace time) schedule with the owner's approval; picker defaults to "No post"; "Check now" confirms with posts count and max cost. 336 tests passing.
- 7.3 rework (2026-10-10): per-creator "Did @x repost?" (card) and "Check all waiting (N)" (Creators, with confirmation) using one recent-search query per creator; users 30 checks/day; cron reads nothing from X. Removed post-level reposters scanning (client, service, job, tests). 328 tests passing.
