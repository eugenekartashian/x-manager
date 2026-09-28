# Decisions

Format: `D-NNN · date · status (Proposed / Accepted / Superseded)` — decision, why, source.

---

## D-001 · 2026-09-28 · Accepted — Monthly budget cap: $5 (X API + AI)

Starting cap, to be recalibrated after real usage. App enforces it server-side; X Console spending limit should be set to the same value as a second guardrail.

## D-002 · 2026-09-28 · Proposed — MVP focus: scheduled Reposts of own posts; user publishes manually

The user writes posts by hand in X for now. The first valuable feature is a Repost scheduler for the user's own posts. Scheduled publishing, media library and engagement inbox move later in the roadmap (still in scope, not dropped).

## D-003 · 2026-09-28 · Accepted (limits pending confirmation) — Repost cadence and anti-spam limits

Matches the user's manual routine (undo + Repost of a few own posts, pinned post twice a day), automated within the $5 budget.
- **Slots per audience window**, each slot with its own IANA timezone (e.g. `09:00 Europe/Berlin`, `09:00 America/New_York`) so DST is handled per region.
- Each slot has user-chosen own posts; the app does **undo Repost (if currently reposted) → Repost**.
- **Budget-driven cap: ~6 undo+Repost pairs/day** (≈ $0.025 × 6 × 30 = $4.50/month). Hard max in code; extra reposts the user does manually in X.
- **Min interval between automatic reposts of the same post: 6 h** (proposed default, configurable) — e.g. pinned post once in the EU window, once in the US window.
- Only the user's own posts; no reposts triggered by engagement signals.

Why: X allows automated Reposts in moderation; "bulk, aggressive, or spammy Reposting is a violation of the X Rules". Budget $5 (D-001) also bounds volume.
Source: [X automation rules](https://help.x.com/en/rules-and-policies/x-automation).

## D-004 · 2026-09-28 · Proposed — Cost model for the Repost MVP

Public pricing ([X pricing](https://docs.x.com/x-api/getting-started/pricing), fetched 2026-09-28):
- Repost = "User interactions": **$0.015 / request** — `UNVERIFIED` mapping, confirm in Console.
- Undo Repost = "Interaction deletion": **$0.010 / request** — `UNVERIFIED` mapping.
- Own posts list (`/users/{id}/tweets`) = "Owned reads": **$0.001 / resource**.
- Same resource re-read within one UTC day is deduplicated (not charged again).

Scenario, 6 reposts/day × 30 days = 180 reposts:
- Reposts: 180 × $0.015 = **$2.70**
- Undo before re-repost (worst case, every time): 180 × $0.010 = **$1.80**
- Own posts sync: ~200 posts/month × $0.001 = **$0.20**
- **Total worst case ≈ $4.70/month** — fits $5 but with little headroom. At 4 reposts/day ≈ $3.15.

AI is not used in the Repost MVP → $0.

## D-005 · 2026-09-28 · Proposed — Scheduler: Supabase pg_cron → secured worker endpoint

Precision needed: ±5–10 min (slots every 3–4 h). Vercel Hobby Cron (once/day) is insufficient. Supabase `pg_cron` + `pg_net` calls `POST /api/jobs/run` every 5 min with a bearer secret; the endpoint runs `processDueActions(now, batchSize)`. Included in Supabase free tier; no extra service.
Alternatives kept in reserve: cron-job.org (free, external), Vercel Pro Cron (paid).

## D-006 · 2026-09-28 · Proposed — Stack & hosting

- Hosting: Vercel Hobby (personal, noncommercial — must move before any paid version).
- DB + storage: Supabase Postgres (via Prisma) + Supabase Storage (later, for media).
- App login: ~~Auth.js (NextAuth v5)~~ **Better Auth with Google** (see D-010), restricted by an email allowlist (user + friend). App login is separate from X.
- X connection: OAuth 2.0 + PKCE on x.com. The user signs in to X exactly as usual (Google + authenticator); the app never sees the X password or 2FA codes — only receives revocable tokens.

## D-007 · 2026-09-28 · Proposed — Ambiguous outcome (UNKNOWN) for Reposts

X does not allow reposting the same post twice without undoing it, so a Repost is naturally idempotent. On timeout/network error: re-check once (repeat the Repost call or read the repost state); "already reposted" = success. If still unclear → `UNKNOWN`, shown in UI with a link to the post for a quick manual look; no further automatic retries. `UNVERIFIED`: exact X error for "already reposted" — confirm during the first approved live test.
For future scheduled original posts (not idempotent) the stricter PRD rule applies: never blind-retry, manual review.

## D-008 · 2026-09-28 · Accepted (fact) — API replies to other accounts are blocked unless summoned

Since 2026-02-23 X restricts programmatic replies via `POST /2/tweets`: an app may reply only if the original author @mentions the user or quotes their post. Applies to Free, Basic, Pro and Pay-Per-Use. Auto-/API-commenting under other accounts' posts is therefore **not possible** for this app.
Consequence: engagement becomes a **reply assistant** — the app prepares text + media and opens X's own composer (web intent `https://x.com/intent/post?in_reply_to=<id>&text=<text>`); the user attaches media and clicks Post in X manually.
Sources: [@XDevelopers announcement](https://x.com/XDevelopers/status/2026084506822730185), [X Dev Community](https://devcommunity.x.com/t/x-api-v2-update-addressing-llm-generated-spam/257909/3).

## D-009 · 2026-09-28 · Proposed — Scheduled original posts deprioritized

The user schedules their own posts manually; X's composer has built-in scheduling (availability per account tier `UNVERIFIED`). In-app publishing/scheduling (old M3) moves to "later, if needed". Reposts are the core feature.

## D-010 · 2026-09-28 · Accepted — App login library: Better Auth (supersedes Auth.js in D-006)

`next-auth` v5 is still `5.0.0-beta.32` (Sep 2026) and the Auth.js team joined Better Auth in 2025. Better Auth 1.7 is stable, supports Next.js 16 and Prisma 7, and offers the needed pieces: Google provider, Prisma adapter, database hooks (allowlist on user and session creation), OAuth token encryption at rest (`account.encryptOAuthTokens`). Telemetry disabled. Google callback path unchanged: `/api/auth/callback/google`.
Source: [Better Auth — Next.js integration](https://www.better-auth.com/docs/integrations/next), npm dist-tags checked 2026-09-28.

## D-011 · 2026-09-28 · Accepted (measured) — Cost estimates are an upper bound; reconcile with Console

First live usage: app recorded $0.055 (2× `users/me`, 20 owned post reads, profile + pinned post read); X Console showed **$0.03** for the same period. X deduplicates the same resource within a UTC day (repeat `users/me`, re-read pinned post), which the app does not model. Decision: keep conservative per-call estimates for the budget guard (never under-counts); the Console remains the source of truth. Revisit if estimates overshoot enough to block legitimate work.

## D-012 · 2026-09-28 · Accepted — Repost limits and single calendar schedule (supersedes limits in D-003)

- Per-post minimum interval is a **user setting** (2–12 h, default 4 h). It is our own anti-spam rule, not an X rule; X only prohibits "bulk, aggressive, or spammy" Reposting.
- Hard ceiling **8 Reposts/day** (user decision). At ≈ $0.025 per undo + Repost, 8/day ≈ $6/month > $5 budget: the budget guard skips Reposts once the month's budget is used; the UI shows the projection.
- **One schedule per workspace**: on/off, start date, duration in days (or no end). Up to 8 daily times; each time has its own IANA timezone and target: pinned post, a specific post, or next from the repost list (cycled after a cursor).
- DST: a skipped wall time runs after the gap; a repeated wall time runs once (earlier instant). Daily cap counted per local day in the workspace timezone.
- Multiple overlapping schedules deferred until the user asks.

## D-013 · 2026-09-28 · Accepted — Every daily time reposts the next post from the repost list

User decision: keep one simple model — daily times + one repost list cycled in order. The "pinned" and "specific post" slot targets are removed from the UI and service (the pinned post can simply be in the list). The `SlotTarget` enum and planner support stay for existing data and the planned multi-list feature (see ROADMAP "Later"). Schedule length is inclusive: start 28 Sept + 3 days = 28, 29, 30 Sept.

## D-014 · 2026-09-28 · Accepted — Job execution model and live-write kill switch

- `processDueReposts(now)` runs occurrences due within the last 30 min (grace for a 5-min scheduler; older ones are not executed late). Each occurrence (slot + local date) is claimed by inserting a unique `dedupeKey`; one worker per workspace via a 2-min lease on `RepostSchedule.processingUntil`. The plan is recomputed after each occurrence from stored state (list cursor, `lastRepostedAt`, runs per day).
- Steps: undo Repost → Repost; on unknown outcome one re-check (Repost again — duplicates are refused by X); still unknown → `UNKNOWN`, counted as done for limits, never retried. Runs stuck in PROCESSING past the lease are recovered with a Repost re-check only (no undo).
- Deleted post (404) → run FAILED and the post is removed from the repost list.
- **`X_WRITES_ENABLED` (default `false`)**: without it the job records `SKIPPED: dry_run` and never writes to X. It is switched on only for the approved live test (2.7) and in production afterwards.

## D-015 · 2026-09-28 · Accepted — Production setup

- Vercel project `x-manager`, functions in `fra1`, fixed domain **x-manager-ek.vercel.app** (OAuth callbacks depend on it), GitHub auto-deploys from `main`. Hobby plan = personal, noncommercial use only.
- Supabase project in Frankfurt; app uses the transaction pooler (6543), migrations/setup the session pooler (5432). Data API disabled, automatic RLS on, RLS on every table, API roles revoked.
- pg_cron job `x-manager-reposts` every 5 min → `net.http_post` to `/api/jobs/run` with the bearer secret read from Supabase Vault. First run verified: HTTP 200.
- Production secrets generated fresh; stored only in `.env.production.local` and as Vercel Sensitive env vars. `X_WRITES_ENABLED=false` in production until the approved live test (2.7).
- Open: Supabase free projects may pause after ~7 days of inactivity — verify whether cron traffic keeps it active.

## D-016 · 2026-09-28 · Accepted (measured) — First live Repost

- Production, 16:40 Madrid, schedule slot → pinned post: UNDO → X 200 "undone" (325 ms), REPOST → X 200 "reposted" (281 ms), run SUCCEEDED, cron response 200.
- Undoing a post that may not have been reposted returned success (no error) — the always-undo-first design holds.
- Console balance $4.96 → $4.94 (cent rounding) — consistent with the $0.025 estimate for undo + Repost. Per-endpoint prices still to confirm on the Console Usage page; keep current estimates.
- Still UNVERIFIED: X's response to a duplicate Repost (not triggered in this test).
- `X_WRITES_ENABLED=true` in production since 2026-09-28 16:37 (user-approved live test).

## D-017 · 2026-09-28 · Accepted — Every daily time reposts the whole repost list (supersedes D-013 cycling)

User decision after the live test: at each daily time, **all** posts in the repost list are reposted (matching the user's manual routine), not one post per time.
- Order: bottom → top of the list, so the first post ends up on top of the timeline (put the pinned post first).
- Each post: undo → Repost (same rules as D-014); ~1.5 s pause between posts; a 45 s time budget per invocation — the next scheduler call (within the 30 min grace) finishes the batch.
- Dedupe key per time + local date + post, so each post runs once per time.
- Per-post interval still applies (a whole batch is skipped if times are closer than the interval — the UI warns); the daily cap counts individual Reposts.
- Cost ≈ times × posts × $0.025/day, capped by the daily limit (8). The list cursor is no longer used.
- Rollout note: deploy only after the grace window of the day's already-run time has passed (old dedupe keys differ).

## D-018 · 2026-09-28 · Accepted — No daily Repost cap; 8 daily times; 2 h default interval; list ≤ 25

- User decision: the only daily limit is the number of daily times (max 8). Each time reposts the whole list regardless of its size; the per-post daily cap (`dailyRepostCap`) is removed.
- Default per-post interval 2 h (options 2–12 h). X has no documented per-post Repost interval; X automation rules only prohibit bulk/aggressive/spammy Reposting. The interval remains our own safeguard.
- X API rate limits (docs.x.com): Repost 50 / 15 min per user, undo Repost 50 / 15 min per user. Repost list capped at 25 posts so one batch stays well inside them.
- UNVERIFIED: account-level daily post limits (reported 50 posts / 200 replies per day for non-Premium accounts since May 2026; unclear whether Reposts count). Official help page could not be fetched — user to check.
- Budget guard stays: when the monthly budget is used, remaining Reposts are skipped. 8 times × 4 posts ≈ $0.80/day ≈ $24/month at current estimates.
Sources: [X API rate limits](https://docs.x.com/x-api/fundamentals/rate-limits), [X automation rules](https://help.x.com/en/rules-and-policies/x-automation), [Understanding X limits](https://help.x.com/en/rules-and-policies/x-limits).

## D-019 · 2026-09-28 · Accepted — Spend estimate models X's same-day deduplication

X pricing: "All resources are deduplicated within a 24-hour UTC day window". Reads now record the returned resource ids in `billed_resource` (workspace, UTC day, kind, id); only ids new for the day are billed (`external_usage.billedUnits`, `costMicros`). Writes (Repost, undo) are billed per request. Every post X returns is billed, including replies we filter out. Dedup is modelled per workspace (conservative: X may dedup across the whole developer account). The Console remains the source of truth.
