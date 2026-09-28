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
- [ ] **3.4 AI suggestions (later)** — short, relevant drafts (Zod-validated, prompt-injection-safe, cost-accounted); no publish capability.
- [ ] **3.5 Discovery (later, paid)** — hashtag search (Recent Search ≈ $0.50/search), bio keyword search (User Search), import from own following.

## M4 — Measurement

- [ ] **4.1** Own post metrics + follower count snapshots (source-labeled, "unavailable" ≠ 0).
- [ ] **4.2** Descriptive comparison (e.g. repost slot times, EU vs US windows) with sample size, no causal claims.

## M5 — Publishing from the app (later, only if needed — D-009)

- [ ] **5.1** Compose & publish now, strict no-blind-retry UNKNOWN flow.
- [ ] **5.2** Scheduled posts with media.

## M6 — Friend beta

- [ ] **6.1** Add friend to allowlist, own workspace + X account.
- [ ] **6.2** Isolation audit across all resources; per-user costs and caps.
- [ ] **6.3** Data retention and deletion policy.

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

## Deferred (not in MVP)

Payments, plans, teams/roles, multiple X accounts per workspace, auto-replies, network-wide search, auto-follow/likes, attribution modeling, NestJS, Redis/BullMQ. Commercial launch requires re-checking X rules and moving off Vercel Hobby.
