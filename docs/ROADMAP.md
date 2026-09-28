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
- [ ] **2.3 Slots & settings** — daily slots in the user's timezone (default 3–4, hard max 6), per-post cooldown (default 7 days), pause/resume switch; preview "what will be reposted next and when".
- [ ] **2.4 Job processor** — `processDueActions(now, batchSize)`: atomic claim + lease, pick next eligible post, undo-if-needed → Repost, audit row per attempt, UNKNOWN handling per D-007, stop when X disconnected or budget reached (user notified).
  - Done when: tests for competing workers, lease expiry, cooldown, daily cap, DST, timeout → re-check → UNKNOWN pass.
- [ ] **2.5 Deploy & cron** — Vercel + Supabase, secured `/api/jobs/run`, Supabase `pg_cron` every 5 min, production env vars. UI states real precision (±5 min).
- [ ] **2.6 History & spend** — action history (reposted / skipped / failed / unknown) and month-to-date estimated spend vs $5 cap.
- [ ] **2.7 Live test** — with your explicit OK: one manual "Repost now", then one scheduled slot; confirm cost in Console matches estimate.

> **Gate 2:** reposts run on schedule, never duplicate, respect cooldown/cap; Console spend matches the estimate. Then we run it for 1–2 weeks and recalibrate budget/cadence.

---

## M3 — Reply assistant (manual publish in X, D-008)

API replies to other accounts are blocked by X unless summoned, so the app **prepares** and the user **posts in X**.
- [ ] **3.1 Target accounts** — manual list of niche accounts (handle, topic, priority, last engaged); optional cheap check of their latest post within budget.
- [ ] **3.2 Reply session** — paste a post URL (or pick from fetched latest posts) → app shows the post, suggests reply text and a media item from the library → "Open in X" launches X's composer with the reply text prefilled; user attaches media and posts. App logs it.
- [ ] **3.3 AI suggestions** — short, relevant reply drafts (Zod-validated, prompt-injection-safe, cost-accounted); no publish capability.
- [ ] **3.4 Media library (images/video)** — private storage, tags, quick download/copy for attaching in X.
- [ ] **3.5 Daily limits** — soft caps per day/per target account, cooldown per account, to keep replies non-spammy.

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

## Deferred (not in MVP)

Payments, plans, teams/roles, multiple X accounts per workspace, auto-replies, network-wide search, auto-follow/likes, attribution modeling, NestJS, Redis/BullMQ. Commercial launch requires re-checking X rules and moving off Vercel Hobby.
