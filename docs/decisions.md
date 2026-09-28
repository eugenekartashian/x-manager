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
