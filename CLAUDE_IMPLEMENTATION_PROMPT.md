You are my senior full-stack TypeScript pair programmer. I am a React/TypeScript
engineer. Read the attached `PRD_X_Content_Manager.md` fully and treat it as the
product source of truth. We will implement this together in small, reviewable
increments. Reply to me in Russian; code, identifiers, and commit messages can
be in English.

## Working contract

- Inspect the repository before proposing changes. Do not assume it is empty or
  overwrite existing work.
- First complete Milestone 0 below and STOP. Do not scaffold or implement before
  I approve the feasibility and architecture decisions.
- After approval, implement only the next approved task. Do not generate the
  entire application in one response.
- For each task: state a concise plan; identify exact files to change; write the
  code; run relevant lint/typecheck/tests; report changed files, verification,
  remaining risks, and the next task. If you cannot run a check, say why.
- Use strict TypeScript, small functions, clear errors, Zod at external
  boundaries. Avoid `any`, excessive abstraction, NestJS, Redis/BullMQ and
  premature SaaS/billing code.
- Keep core services independent from raw X responses and from the scheduler
  trigger. Avoid exposing X tokens, AI keys, service credentials, or sensitive
  media to browser/logs.
- Never use Playwright, Puppeteer, browser macros, scraping, or DOM scripting
  against X. Playwright may test OUR application only.
- Never create automatic likes/follows, mass replies, reply bots, or bypass X
  limits. AI may suggest a reply; an external-account reply requires a separate
  explicit human click for that exact text, media, and target.
- Do not publish real posts, Reposts, or replies on my behalf during coding
  without my explicit instruction for that particular live test. Use mocks/dry
  runs first. Never commit credentials.
- If a requirement conflicts with current official API capabilities/rules, show
  the evidence, offer the smallest compliant alternative, and wait for a
  decision before coding that feature.

## Product shape

Personal content and engagement assistant for X. First one user and one account,
then my friend with their own isolated user/workspace/account; possible
subscription later. Domain foundation: `User -> Workspace -> XAccount`. No
billing, plan, team UI, or multi-account management in the MVP. All user
resources are scoped to the authorized workspace/account. The product helps
compose, schedule, Repost selected original content, review AI suggestions, and
measure approximate results and costs. Do not claim guaranteed follower growth
or causal attribution.

Preferred stack: Next.js App Router, React, TypeScript strict, Tailwind,
PostgreSQL, Prisma, Supabase Postgres/Storage if practical, Next Route
Handlers + service layer, TanStack Query only for interactive client state, Zod,
Vitest, RTL for meaningful UI tests. Choose auth and scheduling after
Milestone 0. AI vendor/model configurable via environment; keep a thin provider
seam, not a generic framework.

## Milestone 0 — Feasibility and architecture (do this now, no app code)

0.1 Read the PRD; list up to 10 material assumptions/questions. Make reasonable
proposals instead of blocking on noncritical preferences.

0.2 Check current **official** X Automation Rules, API docs, Developer Terms and
Developer Console information available to me. Verify operations: OAuth user
context and scopes, create post, upload image/video, Repost, retrieve recent
posts for target accounts, read own post metrics, follower count. For each:
endpoint, auth/scopes, availability/access conditions, billing unit, current
unit cost if visible, rate limits, and open uncertainty. Never invent endpoint
support or prices. If Console access is unavailable, clearly mark it as user
verification and give exact steps/screens to check.

0.3 Estimate X costs for two scenarios using rates actually verified: (A) one
account, scheduled publishing and occasional Reposts; (B) two accounts, 10
manually selected target accounts per user, a small number of reads per day, AI
for only filtered candidates. Include math, media/upload charges if any,
assumptions, upper guardrail, and what cannot be calculated yet. Set no spend
without my instruction. Prefer a manual URL/on-demand engagement flow if
continuous monitoring is expensive.

0.4 Verify scheduling options: Vercel Hobby Cron is currently once/day with low
timing precision, so do not propose it for minute-level posts. Compare the
smallest viable scheduler for the precision we need, including operational cost
and protection of the cron endpoint. Account for Vercel Hobby's noncommercial
restriction if we later sell subscriptions.

0.5 Present a minimal architecture diagram in text, a proposed schema with
unique keys/indexes/ownership boundaries, OAuth token encryption/refresh plan,
job state model, `UNKNOWN` write outcome handling, and a route/service folder
map. Distinguish necessary now from deferred SaaS features.

0.6 Present a milestone plan and acceptance criteria aligned with the PRD.
Identify exact gates that stop implementation if X access/cost/rules are
unfavorable.

Stop after this report and wait for my approval of the choices. Do not scaffold
files yet.

## After approval: task queue, one task at a time

### M1 — foundation

1. Scaffold Next.js + TS strict + Tailwind + Prisma/Postgres, env example and
   scripts. Verify build/typecheck/lint. Do not add unnecessary packages.
2. Implement app authentication, one workspace per user, current-workspace
   authorization helper, migrations and seed for local development. Add
   cross-workspace denial tests.
3. Implement X OAuth with state/PKCE, minimal scopes, encrypted per-account
   token storage, refresh/reconnect/disconnect. Verify the callback cannot
   attach another person's X account to the wrong workspace. Use mocks until a
   separately approved live connection.

### M2 — publishing spike

4. Build a typed X client for creating a text post and mapping X errors/rate
   limits. Dry-run tests first. Add a minimal compose screen and explicit live
   publish action. After I authorize a live test, save the returned X post ID
   and show its URL. Treat timeout/unknown outcome separately from definite
   failure; do not auto-retry an ambiguous write.

### M3 — media and scheduler

5. Implement private Media Library for images first, server-side validation,
   ownership and storage cleanup. Add X media upload integration after
   confirming its current flow. Add video only after validating actual API
   support, processing behavior and cost.
6. Implement drafts and scheduled posts. Store UTC plus timezone, validation,
   edit/cancel, atomic claim/lease, one-shot processing, audit attempt. Expose a
   secured worker endpoint for the selected scheduler. Test competing workers,
   timeout/UNKNOWN, cancellation, and timezone/DST. Show honest scheduling
   precision in UI.

### M4 — reuse own content

7. Implement an optional one-time scheduled Repost of a published own post, with
   duplication and cooldown checks. Add explicit display of pending action.
8. Add a self-reply draft/reminder with manual confirmation and editable
   text/media. No background automatic self-reply.

### M5 — controlled engagement

9. Implement manual target list and small on-demand candidate fetch; persist
   processed post IDs and approximate API usage. Add URL/manual fallback if
   reading targets is impractical. No global crawler.
10. Add deterministic filters before AI, a validated structured reply suggestion
    and media suggestion from stored metadata, model/usage accounting, spending
    guardrail, and prompt injection resistance. AI has no publish capability.
11. Build Engagement Inbox. Only a server mutation tied to the authenticated
    user and one explicitly approved candidate may publish one selected reply.
    Prevent double clicks and cross-workspace access. Test that discovery or AI
    completion cannot publish.

### M6 — measurement and friend beta

12. Add available own-post metric and follower snapshots, action history, rough
    expense view. Mark missing metrics as unavailable, not zero. Do not infer
    exact followers gained per reply or causality.
13. Invite/onboard my friend as a separate user/workspace/account. Run isolation
    and lifecycle tests across media, posts, jobs, credentials, candidates,
    metrics and AI usage. Verify per-account costs and cap background work.

## Definition of done for each task

- The UI flow works locally with a clear empty/error/loading state.
- Server authorizes ownership before reading/mutating resources.
- Relevant tests cover risky behavior; `typecheck`, lint, tests/build pass as
  appropriate.
- Migration and `.env.example` are accurate; no secrets in the repository.
- README/implementation log records setup, key decision, current limitation,
  measured costs if any, and the next task.
- Show me the actual diff summary and wait before starting the next task.

Start with Milestone 0 now.
