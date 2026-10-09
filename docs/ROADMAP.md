# Roadmap — X Content Manager

Source of truth: [PRD](../PRD_X_Content_Manager.md) · Working contract: [implementation prompt](../CLAUDE_IMPLEMENTATION_PROMPT.md) · Rules: [CLAUDE.md](../CLAUDE.md) · Decisions: [decisions.md](decisions.md)

**How we move:** one task at a time, top to bottom. Each task ends with checks passing (`typecheck`, `lint`, `test`, `build` when relevant), an `IMPLEMENTATION_LOG.md` entry, a diff summary and **your approval** before the next task. A failed **Gate** stops the plan until you decide.

**Current focus (D-002):** the user publishes posts manually; the first product value is a **scheduled Repost queue for own posts** (D-003). Budget cap $5/month (D-001).

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped/deferred

---

## M0 — Feasibility & decisions

- [x] **0.1 Key decisions** — budget, focus, cadence, scheduler, stack, UNKNOWN handling → `docs/decisions.md` (D-001…D-007, awaiting approval).
- [~] **0.2 Console check (user)** — done: app `x-manager-personal` (Pay Per Use), OAuth 2.0 Web App + localhost callback, spend cap $5. Left: buy credits before M1.3, verify real per-call prices in Usage after first calls.
  Original task: — in X Developer Console: create a Project/App, confirm pay-per-use access, see the per-endpoint price for Repost / undo Repost / owned reads, set a **$5 spending limit**, enable OAuth 2.0 (type: Web App, callback URL for localhost). Report what you see; I'll turn it into the verified API matrix.
- [x] **0.3 Architecture note** — `docs/architecture.md`: text diagram, Prisma schema draft for M1–M2, token encryption, job state machine, folder map.

> **Gate 0:** Repost + undo + own-posts read are available on your account at a cost that fits $5/month.

---

## M1 — Foundation

- [x] **1.1 Scaffold** — Next.js App Router, TS strict, Tailwind, ESLint/Prettier, Vitest, Prisma + local Postgres (Homebrew), Zod-validated env, `.env.example`, scripts. Fill *Commands* in CLAUDE.md.
  - Done when: `typecheck`, `lint`, `test`, `build` pass on an empty app.
- [x] **1.2 App login & workspace** — Better Auth + Google with email allowlist, one workspace per user created on first login, `requireWorkspace()` helper, seed with two isolated users.
  - Done when: cross-workspace denial tests pass; non-allowlisted email cannot sign in.
- [x] **1.3 X OAuth** (live connect verified 2026-09-28) — OAuth 2.0 + state + PKCE, minimal scopes (`tweet.read`, `tweet.write`, `users.read`, `offline.access`), AES-256-GCM encrypted tokens with key version, refresh, reconnect, disconnect, status UI.
  - Done when: callback can't bind an X account to another workspace (tested); tokens never reach client/logs. First live connection only with your OK.

> **Gate 1 ✅ passed 2026-09-28:** two test users can't see each other's resources; X connected, tokens server-only.

---

## M2 — Repost scheduler (first real value)

- [x] **2.1 X client** — typed calls: list own recent posts, Repost, undo Repost; Zod-parsed responses; error mapping (`X_RATE_LIMITED`, `X_AUTH_EXPIRED`, `X_ALREADY_REPOSTED`, `X_WRITE_UNKNOWN`); 429 backoff; every call recorded in `ExternalUsage` with estimated cost. Mocked tests only.
- [x] **2.2 Own posts & queue** — sync own recent posts (manual "Refresh" button, owned reads), add posts to the Repost queue from the list or by pasting a URL, reorder/remove, see last-reposted date and cooldown status.
- [x] **2.3 Slots & settings** — daily slots in the user's timezone (default 3–4, hard max 6), per-post cooldown (default 7 days), pause/resume switch; preview "what will be reposted next and when".
- [x] **2.4 Job processor** — `processDueActions(now, batchSize)`: atomic claim + lease, pick next eligible post, undo-if-needed → Repost, audit row per attempt, UNKNOWN handling per D-007, stop when X disconnected or budget reached (user notified).
  - Done when: tests for competing workers, lease expiry, cooldown, daily cap, DST, timeout → re-check → UNKNOWN pass.
- [x] **2.5 Deploy & cron** (https://x-manager-ek.vercel.app, 2026-09-28) — Vercel + Supabase, secured `/api/jobs/run`, Supabase `pg_cron` every 5 min, production env vars. UI states real precision (±5 min).
- [x] **2.6 History & spend** — action history (reposted / skipped / failed / unknown) and month-to-date estimated spend vs $5 cap.
- [x] **2.7 Live test** (2026-09-28 16:40, pinned post, D-016) — with your explicit OK: one manual "Repost now", then one scheduled slot; confirm cost in Console matches estimate.

> **Gate 2:** reposts run on schedule, never duplicate, respect cooldown/cap; Console spend matches the estimate. Then we run it for 1–2 weeks and recalibrate budget/cadence.

---

## M3 — Reply assistant (manual publish in X, D-008, D-020)

API replies to other accounts are blocked by X unless summoned, so the app **prepares** and the user **posts in X**.
- [x] **3.1 Target list** — add by @handle or paste a column from Excel (≤ 100 per add, $0.01 per new account via `GET /2/users/by`), profile snapshot (followers, bio, avatar), notes, sort, remove, CSV export for Excel.
- [x] **3.2 Reply templates** — the user's own phrases; a random one is suggested and editable. AI suggestions come later.
- [x] **3.3 Reply session** — target → its latest 3–5 posts (on demand) → template → "Open in X" (composer prefilled with the reply text; media attached manually by the user) → logged. Limits: 1 reply per account per 24 h, 15 replies per day.
- [x] **3.4 AI suggestions** — short, relevant drafts (Zod-validated, prompt-injection-safe, cost-accounted); no publish capability.
- [ ] **3.5 Discovery (later)** — finding new big accounts to reply under. Ideas, cheapest first (all official API or plain links; no scraping):
  1. ✅ (2026-09-30) **Free: "Share to X Manager".** Make the app installable (PWA) with a share target: on the phone, open any profile in X → Share → X Manager → it lands in Targets (only the profile URL is shared, then one ≈ $0.01 lookup). Plus pasting several profile links at once (works today with @handles).
  2. **Cheap: import from your own following** — `GET /2/users/:id/following`, billed per returned user (≈ $0.01 each) → cap at e.g. 100 newest (≈ $1), then filter by followers count and let the user pick.
  3. **Paid, on demand: hashtag / keyword search** — Recent Search for e.g. `#muscleboy -is:retweet`, group results by author, rank by followers and post engagement, show "≈ $X for this search" before running; a hard monthly cap.
  4. **Paid: "accounts like this target"** — authors of the top replies under a target's fresh posts (conversation search), same preview-cost-first rule.
  Verify every price in the X Developer Console before building (UNVERIFIED).

## M4 — Measurement (future; plan recorded 2026-09-30)

Principle: as close to free as possible — reuse data we already fetch, one small daily snapshot, never poll. Everything descriptive: sample size shown, "unavailable" ≠ 0, no causal claims ("followers gained per repost" is not measurable).

**Data and cost (X pay-per-use, estimates):**
- Follower count: one `GET /2/users/me` per day (User read ≈ $0.010) → ≈ $0.30/month per account.
- Own post metrics (likes, reposts, replies, impressions): owned reads ≈ $0.001 per post; one daily snapshot of the repost list + ~20 latest own posts ≈ $0.02/day ≈ $0.60/month. Same-UTC-day dedup makes extra refreshes that day free.
- Reuse for free: every "Refresh from X" and every Repost batch already returns/implies data — store a snapshot whenever we have it.
- AI: not needed.

**What to show:**
- [ ] **4.1** Followers over time (daily line, delta per week).
- [ ] **4.2** Per post: impressions/likes over time with markers where our Reposts happened; "views gained in the 24 h after a Repost" (descriptive, n shown).
- [ ] **4.3** Time windows: EU vs US slots — median views gained after Reposts per slot, with sample size; flagged "not enough data" under ~10 samples.
- [ ] **4.4** Replies (Targets): how many replies opened per week and per account (we cannot reliably read results of replies without extra reads — keep it to counts).

## M7 — Collab CRM (planned 2026-10-09, D-033)

Find creators, write to them one by one, track collaborations and who shared your post. Everything that happens on X is done by the user by hand; the app suggests, tracks and counts.

Prices from [X API pricing](https://docs.x.com/x-api/getting-started/pricing) (read 2026-10-09): Post read $0.005, User read $0.010, Following/Followers read $0.010 — **$0.001 as Owned Reads** for the app owner's own following/followers; all resources deduplicated per UTC day. `reposted_by` billing bucket UNVERIFIED (likely User read $0.010 per reposter) → step 7.0.

- [x] **7.0 Price check** (2026-10-09, ≈ $0.20) — timeline read of a target: $0.10 for 20 items (Console matched); active RT4RT creators repost 20+ times a day, so per-creator checks are expensive. `GET /2/tweets/:id/retweeted_by` returns reposters **newest first** (verified: the owner's fresh Repost moved to #1).
- [x] **7.1 Creators table** (2026-10-09) — Targets become a CRM: status (new / to write / waiting / reposted / partner / declined / no reply), tags, source, last contact; table on desktop + cards on mobile; status tabs, search, filters, sort, pagination (50); bulk tag/remove (no bulk messaging); `.xlsx`/`.csv` import.
- [x] **7.2 Creator card & outreach** (2026-10-09) — profile, notes, tags, history; AI draft per creator (collab / mutual promotion, varied, not identical mass text); "Open in X" DM with prefilled text (DM intent link UNVERIFIED → fallback copy text + open profile); "Mark as sent"; per-day message limit for users.
- [x] **7.3 Promote a post** (2026-10-10; the promoted post is the one linked in a confirmed message — no separate campaign object needed) — campaign = one own post + linked creators. Daily check **per post, incremental**: read `retweeted_by` newest first and stop after 3 consecutive reposters already seen in the previous check → pay only for new reposters (≈ $0.01 each; e.g. 40 messages, 25 Reposts in a day ≈ $0.25). Only posts with creators in "waiting"; + "Check now". New reposters matched to CRM creators → "✓ They reposted"; separate manual "✓ I reposted back"; filter "Waiting for my repost". Links to their profile/post so the user reposts in X themselves.
- [ ] **7.4 Discover creators with AI** — sources: hashtag/keyword search, accounts you follow, accounts a creator follows; cost preview before running; candidate cache 30 days with pagination cursors; existing targets filtered out; AI ranks with a reason; user selects ≤ 10 to add (adding from cache is free).
- [ ] **7.5 Stats & polish** — outreach stats (sent, replies, reposts, partners) on the dashboard; user limits in /admin; empty states and onboarding hints.

### Later in M7 — send DMs from the app (X Chat API), only if manual paste becomes the bottleneck

X Chat is end-to-end encrypted: sending through the API needs per-user identity/signing keys published to X, a PIN-protected key backup, conversation-key exchange and the Chat XDK to encrypt/sign each message ([X Chat API](https://docs.x.com/xchat/introduction)); X advises keeping private keys on the user's device. Also `dm.write` scope (re-connect for everyone) and $0.015 per message. Big security and engineering task — revisit with a separate plan (client-side keys via WASM, one explicit click per message, never bulk).

## Next steps after the real-use test (plan recorded 2026-09-29)

Order is a proposal; each step starts only after the user approves its short plan.

1. **Test feedback round** — fix whatever the 1–2 days of real use surface (bugs, UX friction, copy). Review spend in History vs the X Developer Console.
2. **Dashboard v1** — see "Dashboard — what to show" below (needs-attention, next batch, today's numbers). No new X reads.
3. **Multi-user foundation (admin + users)** — roles `admin` / `user`; the admin (main account) sees all workspaces, their spend and limits; users see only their own workspace and a simplified UI (hide cost internals, dev-only info). Per-user limits (list size, daily times, replies/day, AI ideas/day, monthly budget) stored per workspace and enforced server-side. Replace the email allowlist with admin-managed invites. Cross-workspace isolation audit (M6).
4. **Plans & payments (decision first, then code)** — plan tiers derived from real unit costs (≈ $0.025 per Repost, AI ≈ $0.001 per ideas request); payment provider choice (e.g. Stripe), subscription → limits mapping, what happens on failed payment. Re-check X Developer Agreement/Policy for a multi-user commercial app before charging anyone.
5. **Legal & hosting before paying users** — Terms, Privacy Policy, data deletion; move from Vercel Hobby / Supabase free to paid plans.
6. **Metrics (M4)** — own post trends and descriptive comparisons, once there is enough data.
7. **Backlog** — custom list name, multiple lists with their own schedules, target tags (e.g. category), paid discovery (3.5).

## Dashboard — what to show (plan recorded 2026-09-29; v1 done 2026-09-30, post metrics wait for M4)

Today the dashboard only shows the workspace and the X connection. Goal: one screen answering "is everything running, and what needs me?". Only data we already store — no extra X reads just to fill the dashboard.

1. **Needs attention** (top, only when non-empty): X needs reconnect; Reposts in `UNKNOWN` (manual check) or `FAILED` in the last 24 h; budget ≥ 80 %; posts removed from the list because they were deleted.
2. **Next Repost batch:** schedule on/off, next time (workspace timezone) and the posts in order; result of the last batch (n succeeded / skipped / failed).
3. **Today:** replies opened n / daily limit, AI idea requests, API spend today and this month vs budget (estimate label).
4. **Quick links:** open Targets (sorted by who you can reply to now — not in cooldown), Posts, History.
5. **Later with M4:** simple trends of own reposted posts (views/likes over time, sample size shown, no causal claims).
6. **Later with the commercial version:** admin view — users, their plan, spend and limits.

## M6 — Friend beta (current focus, 2026-09-30)

Roles: **superadmin** (the owner, bootstrap email in env) and **user**; the role lives in the DB so a regular `admin` can be added later without rework. The owner pays all X API costs during the beta.

**Beta limits for users** (set per user by the superadmin, enforced server-side; the superadmin has none):

| Feature | Limit | Worst-case X cost / month |
|---|---|---|
| Repost list | max **2** posts (changed 2026-09-30, was 4) | — |
| Daily times | max **4** (was 2), ≥ 1 h apart | 2 × 4 × 30 = 240 Reposts × ≈ $0.025 ≈ **$6** (real ≈ $0.02 → ≈ $4.80) |
| Targets | max **3** accounts at a time | adding ≈ $0.01 each |
| Target post loads | max **3 per day** total (proposal; 10 posts per load ≈ $0.05) | ≈ **$4.50** |
| AI ideas | **5 per target per day** (proposal; ≈ $0.001 each) | ≈ $0.50 |
| Monthly budget (safety net) | **$10** | hard stop for reads/AI; the user sees "limit reached", never prices |

Users never see prices: no $ on buttons, no spend banner, history without amounts. They see only "used n of limit". The superadmin sees everything as today plus per-user spend.

- [x] **6.1 Roles & access in the DB** (D-025) — `role` on user (`USER` / `SUPERADMIN`); invites table replaces the `ALLOWED_EMAILS` env list (migrated from it); superadmin bootstrap via env so the owner can never be locked out; revoking access signs the user out and pauses their schedule.
- [x] **6.2 Admin page `/admin`** (list, invite, revoke; limits and feature switches move to 6.3) — users (email, X handle, joined, last active, month spend vs budget, status); invite, revoke, edit limits, enable/disable Targets & AI per user.
- [x] **6.3 Per-user limits & user UI** (D-026) — limits stored per workspace, enforced in services; prices hidden for users; limit counters in the UI; global spend cap across all workspaces.
- [x] **6.4 Scale & safety** (parallel job + load test, security audit, Sentry live 2026-09-30; uptime monitor = user-side UptimeRobot) — per-workspace fan-out of the Repost job + load test (200 fake workspaces); error monitoring + uptime alert; isolation audit across all resources (IDOR tests for every resource type).
- [x] **6.5 Data & legal minimum** (/privacy, /terms, "Delete my account") — Privacy Policy + Terms pages (we store other people's X tokens), data retention, "delete my account and data" (revokes X token, deletes rows).
- [ ] **6.6 Launch beta** — raise the X Developer Console spend cap (currently $5 for the whole app — all users share it); re-check X Developer Agreement/Policy for a multi-user app (links in decisions.md); invite 3–5 friends.

---

## Later — ideas to revisit (user requests)

- **Custom name for the repost list** (user request 2026-09-28) — e.g. "Main", "Promo"; today it is fixed as "Repost list" (`src/features/schedule/list-badge.tsx`). Natural first step toward multiple lists.
- **Multiple repost lists, each with its own schedule** (e.g. "Main posts" at EU+US prime time, "Promo" on weekends). Today: one list + one schedule (D-012, D-013). Revisit after a few weeks of real use.
- **Reconcile with X billing API** — use `GET /2/usage/credits` if X makes it reliable (same-day dedup is modelled since 2.6).
- **Media previews for posts that embed another post's video** (needs one extra read per post).

## Future: commercial version for creators (idea recorded 2026-09-28, not started)

Goal: sell scheduled Reposts as a service to creators who don't want to do it by hand, with prices that cover X API costs and leave a margin. Before any work:

- **Unit economics:** each Repost ≈ $0.025 in X API cost (undo + Repost, D-016) + reads for refreshes. Model cost per customer = times/day × posts × days, add hosting, payment fees, support; set plan prices with margin and hard caps per plan.
- **Plans & limits:** e.g. tiers by daily times, list size and days per month; enforce per-workspace budget (already exists) derived from the plan; overage policy (stop vs. pay-as-you-go).
- **X platform rules:** re-check X Developer Agreement/Policy for a multi-user commercial app (each creator connects their own account through our app; our developer account pays API usage), automation rules for Reposts at scale, whether X app review / a different access tier is required, and account-level daily post limits for non-Premium users.
- **Billing:** Stripe (or similar) subscriptions + usage metering from `ExternalUsage`; invoices, refunds, failed payments.
- **Product/infra:** self-serve sign-up (replace the email allowlist), onboarding, team/agency roles, abuse prevention, per-customer isolation audit (M6), status page and alerts.
- **Legal & hosting:** Terms of Service, Privacy Policy, data retention/deletion, GDPR (EU users); move off Vercel Hobby (noncommercial) and Supabase free tier to paid plans.
- **Marketing constraints:** no "get more followers" promises (X rules, PRD §4).

### Pricing idea: subscription + credits (to think about later, recorded 2026-09-29)

Not decided — revisit after the friend beta shows real usage.

Unit costs (X API, estimates): Repost (undo + Repost) ≈ $0.025; 5 posts × 2 times/day ≈ $7.50/mo; × 4 times/day ≈ $15/mo; one Target load (10 posts) ≈ $0.05, 10 loads/day ≈ $15/mo; AI ideas ≈ $0.001/request (negligible). An active user costs ~$15–30/mo in X API alone, before VAT (21 % in Spain) and payment fees (3–5 %). Rule of thumb: price ≥ 2.5–3× X cost; below ~€15/mo it does not cover costs.

Options:

1. **Subscription with included volume + credit top-ups** (preferred idea): e.g. Basic ~€19 (Reposts only: 5 posts, 2 times/day), Pro ~€39 (3–4 times/day, Targets ~5 loads/day, AI ideas), credit packs (e.g. €10) for extra Reposts/loads. Credits map naturally onto `ExternalUsage` (already tracked per action).
2. **Split by features only** (Basic = Reposts, Pro = + Targets/AI) — simplest to explain, but heavy users can exceed their payment.
3. **Credits only** (pay-as-you-go) — fair, but unpredictable revenue and unusual for customers.

Market check (from memory, unverified): similar X tools (Hypefury, Typefully, Tweet Hunter) ≈ $12–49/mo, usually without per-action X API costs.

### Cost per user at max usage (beta limits, calculated 2026-09-30)

Limits: 2 posts × 4 times/day, 3 targets, 3 loads/day, 5 AI ideas per target per day. Prices from `integrations/x/pricing.ts`; averages measured in production (AI ≈ $0.00056/request, a target load ≈ 4.3 billed posts ≈ $0.021).

| Action (30 days) | Worst case | Typical |
|---|---|---|
| Reposts: 240 × (undo $0.010 + Repost $0.015) | $6.00 | $4.80 (X billed ≈ $0.02 each) |
| Target loads: 90 × up to 10 posts × $0.005 | $4.50 | $1.90 |
| AI ideas: 450 × $0.00056 | $0.25 | $0.10 |
| Own posts refresh (same-day re-reads free) | $1.05 | $0.30 |
| Adding targets ($0.01 each) | $0.10 | $0.03 |
| **Total X + AI** | **≈ $11.90** | **≈ $7.10** |

Shared hosting (Vercel Pro + Supabase Pro) ≈ $45/month. After VAT (21 %) and payment fees (~5 %) about 78 % of the price remains: €24–29/month for this package keeps a margin even at worst case; a Reposts-only tier (worst ≈ $7) fits €12–15.

### Scaling & hosting for many users (assessment 2026-09-29)

Servers are not the bottleneck; these are:

- **Repost job throughput.** Today one cron call (every 5 min) processes all workspaces sequentially within a 45 s budget. Example: 100 users × 5 posts × 1.5 s pause ≈ 12 min — does not fit. Before multi-user: fan out per workspace (e.g. the cron call enqueues/dispatches one invocation per due workspace) so batches run in parallel. Do this as part of "Multi-user foundation".
- **X API cost** is paid by our developer account and grows linearly with users → plan limits and per-workspace budgets are mandatory (budget guard exists).
- **X rate limits** are per user token (e.g. 50 Reposts / 15 min) — enough for this use case.

How to verify before opening up:

1. Separate staging environment (copy of prod config, own DB, `X_WRITES_ENABLED=false`).
2. Load test of the job processor against fake X (e.g. 200 workspaces), as in the integration tests.
3. Error monitoring (e.g. Sentry) + uptime check with alerts to the admin.
4. Gradual rollout: 3–5 friends → ~20 users → public.

Hosting decision: **stay on Vercel + Supabase.** Hundreds of users are a small load for them; AWS/GCP would add ops work (servers, networking, DB, backups, security) that only pays off at a much larger scale. Mandatory for commercial use: paid plans (Vercel Hobby is noncommercial; approx. Vercel Pro ~$20/mo, Supabase Pro ~$25/mo — re-check prices before switching). Low lock-in: standard Next.js + Postgres (only pg_cron/Vault setup is Supabase-specific), so migrating later is possible.

Payments & taxes: **the user will research the provider and tax setup (Spain) independently.** Open question to answer first: whether the chosen payment provider accepts a SaaS tool for adult-content creators.

## Deferred (not in MVP)

Payments, plans, teams/roles, multiple X accounts per workspace, auto-replies, network-wide search, auto-follow/likes, attribution modeling, NestJS, Redis/BullMQ. Commercial launch requires re-checking X rules and moving off Vercel Hobby.
