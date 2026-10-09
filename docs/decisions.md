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

The user schedules their own posts manually; X's composer has built-in scheduling (verified on the user's account in the x.com web composer on 2026-09-29: date, time, timezone, "Scheduled posts" list). In-app publishing/scheduling (old M3) moves to "later, if needed". Reposts are the core feature.

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

## D-020 · 2026-09-28 · Accepted — Reply assistant scope

- Targets are added manually by @handle (single or pasted column from Excel/Sheets; CSV export for Excel). Paid discovery (hashtag search, bio search, following import) deferred.
- Reply text: user-defined templates first; AI later.
- Limits: 1 reply per target account per 24 h, 15 replies per day. Replies are posted by the user on x.com via the composer intent (media attached manually — the intent cannot attach media).
- Target list ≤ 500 accounts; lookups ≤ 100 handles per call; handles already listed are not looked up again.

## D-021 · 2026-09-29 · Accepted — AI reply ideas and configurable reply limits

- AI reply ideas use the Claude API (`@anthropic-ai/sdk`), model from `AI_MODEL` (default `claude-opus-5`, the recommended default; switch to a cheaper model by env if the user decides), `output_config.effort: "low"`, JSON-schema structured output (1–3 ideas ≤ 280 chars, Zod-validated), server-side refusal fallback `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). No tools: the model cannot act or publish. Post text, bio and notes are passed as delimited untrusted data. Cost recorded per call from token usage (provider AI); budget check + 100 ideas/day cap. Feature off without `ANTHROPIC_API_KEY` (server-only).
- Reply limits are user settings: cooldown per account 6/12/24 h, 10–50 replies/day (defaults 24 h / 15). X publishes no exact thresholds; account-level limits for non-Premium accounts are reported but unverified.
- Target posts: fetch 10, keep the 5 latest originals (replies/Reposts are filtered out).
- Automated replies (with or without AI) stay out of scope: X blocks unsummoned API replies (D-008) and its automation rules prohibit automated unsolicited replies.

## D-022 · 2026-09-29 · Accepted — AI provider: OpenAI by default, Claude kept as an option

User preference (existing OpenAI credit). The AI seam supports both providers via `AI_PROVIDER` (`openai` default | `anthropic`) and `AI_MODEL` (empty = provider default: `gpt-5-mini` via the Responses API with strict JSON-schema output and low reasoning effort; `claude-opus-5` via the Messages API with `fallbacks: "default"`). Shared prompt, untrusted-data delimiting, Zod validation, no tools, cost accounting and limits are provider-independent. OpenAI key scope: Restricted, Responses = Write only. Prices: developers.openai.com/api/docs/pricing (fetched 2026-09-29): gpt-5-mini $0.25 / $2 per 1M tokens.

## D-023 · 2026-09-29 · Accepted — Repost batch runs in list order (supersedes the order part of D-017)

User preference: #1 in the repost list is reposted first, then #2, … Because X timelines show the newest item first, the LAST post of the list ends up on top of the profile. UI copy on Posts and Schedule says so. Dedupe keys (`slotId:localDate:postId`) do not depend on order, so switching mid-window cannot duplicate a Repost.

## D-024 · 2026-09-30 · Accepted — In-app publishing dropped; beta limits

- In-app publishing / scheduled original posts (old M5) is **dropped**: X's composer scheduling covers it (D-009, verified). Removed from the roadmap.
- Friend beta (M6): superadmin (owner) + users; owner pays X costs. User limits: 4 posts in the repost list, 2 daily times, 3 Targets, target post loads and AI ideas capped per day, $10/month safety budget. Users never see prices.

## D-025 · 2026-09-30 · Accepted — Access via DB invites; roles USER / SUPERADMIN

- `ALLOWED_EMAILS` (env) is replaced by `SUPERADMIN_EMAILS` (env, bootstrap: the owner can never be locked out) + the `access_invite` table for everyone else. The migration backfills invites for all existing users.
- Role on `user`: `USER` (default) or `SUPERADMIN`. SUPERADMIN mirrors `SUPERADMIN_EMAILS` and is synced on sign-in and on each request; a regular `ADMIN` role can be added later as another enum value.
- Revoking: invite gets `revokedAt` (kept for audit), the user's sessions are deleted and their Repost schedule is paused. Re-inviting re-activates the same row.

## D-026 · 2026-09-30 · Accepted — Per-user limits (friend beta)

- Limits live on `workspace` (`limitListPosts` 4, `limitDailyTimes` 2, `limitTargets` 3, `limitTargetLoadsPerDay` 3, `limitAiIdeasPerTargetDay` 5, `targetsEnabled`, `aiEnabled`); new workspaces get a $10 monthly budget. The superadmin (role or `SUPERADMIN_EMAILS`) is unlimited.
- Enforced server-side in services (add to list, add daily time, add targets, load target posts, AI ideas) and in the Repost job + schedule preview (only the first N posts / N times run, so lowering a limit takes effect immediately without deleting data).
- Daily counts (target loads, AI per target) use `feature_usage`, per workspace-local day.
- The superadmin edits limits and budget per user in `/admin`.
- Users never see prices (banner only when their limit is reached, no $ on buttons, History without spend); only the superadmin can change a budget (`saveBudgetAction` requires superadmin). Users see allowances: list n/cap, times n/cap, targets n/cap, loads left today, AI ideas left today per target.
- Optional `GLOBAL_MONTHLY_BUDGET_USD` caps estimated spend of all users together (checked in `canSpend`); unset = per-user budgets only.

## D-027 · 2026-09-30 · Accepted — Users don't tune intervals or reply limits

- Regular users no longer see or change the per-post Repost interval or the reply limits; those forms and their actions are superadmin-only.
- Users have a fixed rule: a post is reposted at most once per hour (`USER_REPOST_INTERVAL_MINUTES`), and new daily times must be ≥ 1 h from their other times (`too_close`). Reply limits stay at the workspace defaults (1 reply per account per 24 h, 15/day).
- The superadmin keeps their own configurable values.
- 2026-09-30 update (D-026): default user limits changed to **2 posts × 4 daily times** (was 4 × 2) — same 240 Reposts/month at max; existing users still on the old defaults were migrated.

## D-028 · 2026-09-30 · Accepted — Error monitoring: Sentry (errors only, no personal data)

- `@sentry/nextjs` 11 (supports Next 16). Enabled only in production builds when `NEXT_PUBLIC_SENTRY_DSN` is set; dev and tests never send.
- Privacy: `tracesSampleRate: 0`, no Session Replay / feedback widget; `dataCollection` disables user info, cookies, headers, bodies, query params, DB/queue/AI data and **stack-frame local variables** (decrypted X tokens live in server memory). `beforeSend`/`beforeBreadcrumb` strip query strings (the X OAuth callback carries `code`/`state`), request data and `user`.
- Source maps upload only if `SENTRY_AUTH_TOKEN` is set at build time (optional).
- Plan: free Developer tier (limits per Sentry's pricing page — verify there).

## D-029 · 2026-09-30 · Accepted — Privacy Policy, Terms, account deletion

- Public `/privacy` and `/terms` (plain language, describe only what the app really does, incl. OpenAI for on-demand AI ideas and Sentry for scrubbed errors). Linked from sign-in and the app footer; to be entered in the X Developer Console app settings. Not legal advice — review before a paid launch.
- "Delete my account" (users, not the superadmin): revokes the X token at X, deletes the user; everything they own cascades from the workspace; the invite is removed. Confirmation by typing DELETE.
- Optional `LEGAL_CONTACT_EMAIL` shown on the legal pages.

## D-030 · 2026-09-30 · Accepted — X rules for a multi-user app (review + fixes)

Sources read 2026-09-30: [X Developer Policy](https://docs.x.com/developer-terms/policy), [X Developer Agreement](https://docs.x.com/developer-terms/agreement) (last updated 2026-04-27), [Automation rules](https://help.x.com/en/rules-and-policies/x-automation) (help.x.com blocks automated fetches; content taken from X's official summary via search).

Already compliant: privacy policy; show exactly what is published; no automated replies/DMs/follows (users post replies themselves); automated Reposts allowed if not bulk/aggressive/spammy (limits: ≤ 2 posts, ≤ 4 times/day, ≥ 1 h apart); only own posts (no identical content across accounts); content fetched with one user's token never shown to another; no model training on X content.

Fixed now:
- **Express consent** ("authenticating into your service does not by itself constitute consent"): `repost_schedule.consentedAt`; switching the schedule on requires ticking an explicit consent box; the job ignores schedules without consent.
- **Service authenticity** (no names implying affiliation with X): "not affiliated with or endorsed by X Corp." on sign-in, app footer and Terms. A name without "X" is needed before a public/paid launch.
- **Content compliance** (keep stored X content current, delete what is deleted on X): target posts are purged 3 days after loading by the cron job (`purgeStaleTargetPosts`).

Open before a paid launch: Developer Policy "Pay to engage" forbids receiving compensation "for any X actions … reposts, likes, comments, and replies" — likely aimed at paid engagement, but the wording is broad and the paid product would be automated Reposts → get legal advice or written confirmation from X. Monetised use also requires the app to be designated commercial in the X Console.

## D-031 · 2026-09-30 · Accepted — Superadmin export of targets across users (aggregated)

`/admin` → "Targets across users" → CSV: username, name, followers, number of users who added the account, profile URL — never who added it, no notes. Disclosed in the Privacy Policy as aggregated, anonymous statistics. Useful for spotting popular accounts (future discovery, 3.5).

## D-032 · 2026-10-01 · Accepted — Public landing page with "Want to try" requests

- `/` is now a public landing page (was a redirect to /dashboard): 6 sections — hero, why (subscription creators who promote on X), how it works, features, safety, request form — plus header (Privacy, Terms, Sign in / Open app, Want to try) and footer with the not-affiliated notice. Dark, minimal, green accent; no X logo or marks; copy states what the app does, no follower/growth promises. Animations: reveal-on-scroll (content stays visible without JS) and light parallax; both off with prefers-reduced-motion. UI mock-ups are pure CSS (no screenshots, no explicit content).
- "Want to try" → `access_request` (email, optional X username, message; RLS on; honeypot field; max 1,000 pending; people who already have access get the same answer and nothing is stored). `/admin` → Access requests → Invite (creates the invite, deletes the request) or Dismiss (deletes it). Disclosed in the Privacy Policy.

## D-033 · 2026-10-09 · Proposed — Collab CRM boundaries

The user wants RT4RT-style partner outreach (example: agencies DM-ing links with "RT this or my pinned"). Agreed scope, keeping the app's own X actions limited to the user's own posts:
- **No automated or app-sent DMs.** Messages are drafted (optionally with AI, personalised and varied per creator) and sent by the user in X, one at a time ("Open in X"). Per-day message limit for users.
- **The app never reposts other people's posts** and never triggers a Repost from someone else's action (CLAUDE.md hard rule). It only *shows* that a creator reposted the user's post, with links to that creator on X; anything the user does in return happens manually in X.
- Repost checks (after the 7.0 test, 2026-10-09): per-creator timelines are expensive for active RT4RT creators (20+ Reposts/day each). `retweeted_by` is newest-first, so the daily check reads each promoted post's reposters from the top and stops after 3 consecutive already-seen accounts → cost ≈ new reposters only. "They reposted" may be set by the check or by hand; "I reposted back" is always manual.
- AI discovery: user-chosen source, cost preview, ≤ 10 additions per run, candidate cache to avoid paying twice, existing targets excluded.
- Residual risk (explicitly accepted by the user): X Developer Policy discourages compensated/reciprocal engagement and services that enable policy violations; the design keeps all X actions human and one-by-one, and the user agreement for creators will restate X rules.
- 2026-10-09 (D-033): DM intent link does not prefill text on x.com → the app copies the message to the clipboard and asks the user to confirm it was sent; the per-day count includes opened-not-undone messages.
- 2026-10-09 (D-033, user test): neither `messages/compose?…&text=` nor direct chat links (`x.com/messages/<a>-<b>`, `x.com/i/chat/<a>-<b>`) prefill text in X Chat; both direct links open the 1:1 chat. The app opens `x.com/i/chat/<lower id>-<higher id>`, copies the text first, and records the message (history, status, daily count) **only when the user confirms "Yes, sent"**. Undone messages are hidden from history.
- 2026-10-09 (D-033, user decision): opening the chat **counts as sent** (people forget to confirm and reload); "Didn't send it — undo" in the panel and "undo" on the message in History for 24 h. The app cannot see deletions in X (encrypted X Chat), so the user undoes manually.
- 2026-10-10 (D-033): phones open the chat via the X app link `twitter://messages/compose?recipient_id=…` (opens the 1:1 chat directly on iPhone — user test); desktop keeps `x.com/i/chat/<a>-<b>`. Repost checks implemented: promoted posts = own posts linked in confirmed messages to creators still "Messaged"; daily (≤ every 20 h) incremental `retweeted_by` scan (pages of 20, ≤ 5 pages, stop after 3 known), matches → "Reposted"; after 3 days → "No reply"; "Check now" (users: 3/day); "I reposted back" is manual. The app never reposts other people's posts.
- 2026-10-09 (D-033, incident + owner decision): an automatic first check of the pinned post (283 Reposts) read 100 reposters ≈ $0.89 before the 2-page cap shipped, because the post picker defaulted to the first post of the repost list. Fixes: post picker defaults to "No post"; first check ≤ 2 pages (≈ $0.40); "Check now" shows posts count + max cost (superadmin) and needs confirmation; automatic checks run **once a day after 09:00 workspace time** (approved by the owner).
- 2026-10-10 (D-033, owner decision): **repost checks only by click, per creator, via X recent search** — `from:<creator id> (retweets_of_tweet_id:<post> OR quotes_of_tweet_id:<post>)` ([search operators](https://docs.x.com/x-api/posts/search/integrate/operators)): exact regardless of how many other Reposts the creator made, 0–2 results → ≤ $0.01 (Post read $0.005 per result; a no-result query should be free — UNVERIFIED until the first live check), last 7 days only. No automatic X reads; the cron only turns 3-day silence into "No reply" (free). Post-level `retweeted_by` checks removed (table `promoted_post_check` left unused).
