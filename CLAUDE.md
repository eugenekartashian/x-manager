@AGENTS.md

# CLAUDE.md — X Content Manager

Personal content & engagement assistant for X (Twitter): schedule own posts with media,
one-off Reposts of own content, AI-suggested replies that a human publishes one by one,
and honest measurement of results and costs.

- **Product source of truth:** [PRD_X_Content_Manager.md](PRD_X_Content_Manager.md)
- **Working contract & task queue:** [CLAUDE_IMPLEMENTATION_PROMPT.md](CLAUDE_IMPLEMENTATION_PROMPT.md)
- **Decisions:** `docs/decisions.md` (date + link to official source for every decision)
- **Progress:** `IMPLEMENTATION_LOG.md` (updated after every task)

If this file conflicts with the PRD, the PRD wins. If the PRD conflicts with current
official X rules/API, stop and ask (see "Escalate, don't improvise").

## Communication

- Reply to the user in **Russian**. Code, identifiers, comments, commits, docs in `docs/` — English.
- Be direct: plan → change → verification → risks → next step. No filler, no over-promising.
- When something was not verified (no Console access, check not run), say so explicitly.

## Workflow (non-negotiable)

1. **Inspect before changing.** Read the relevant files; never assume the repo is empty; never overwrite existing work.
2. **One approved task at a time.** Follow the milestone queue in the implementation prompt. Do not scaffold or build ahead of approval. Milestone 0 (feasibility) must be approved before any app code.
3. **Per task:** short plan → exact files to touch → code → run `typecheck`, `lint`, `test` (and `build` when relevant) → report changed files, verification output, risks, next task → **stop and wait**.
4. **Small, reviewable diffs.** No drive-by refactors, no unrelated formatting churn, no speculative abstractions.
5. **Gates are hard stops.** If a gate (access, cost, rules, precision) fails, do not proceed automatically.
6. Record every load-bearing decision in `docs/decisions.md`; record progress, measured costs and limitations in `IMPLEMENTATION_LOG.md`.

## Hard product rules (X compliance)

These are never traded off for convenience or speed.

- **Official X API only.** No Playwright/Puppeteer/browser automation, scraping, DOM scripting or unofficial endpoints against X. Playwright is allowed only for testing *our* app.
- **No automated engagement.** No auto-likes, auto-follows, mass replies, reply bots, duplicate/near-duplicate mass posts, Repost loops, or Reposts triggered by engagement signals.
- **AI suggests, human publishes.** AI code paths have no publish capability. A reply to another account is sent only from a server mutation triggered by an explicit user click that approves *one* exact text + media + target. No batch approval, no auto-send. Self-replies also require a manual click.
- **Scheduled Repost of own post:** opt-in, one-off, with duplicate/cooldown checks and visible pending state.
- **Never bypass rate limits.** Respect 429s with backoff; surface errors to the user.
- **No growth promises** in UI copy ("get more followers" etc.). Analytics are descriptive, show sample size, never claim causality or "followers gained per reply".
- **No live writes to X during development** (posts, Reposts, replies) unless the user explicitly authorizes that specific live test. Default to mocks/dry-run.

## Escalate, don't improvise

Stop and ask when:
- A requirement conflicts with current official X docs/rules/pricing → show evidence (link), propose the smallest compliant alternative, wait.
- An endpoint, scope, price or limit cannot be verified → mark it `UNVERIFIED` with exact steps for the user to check in the Developer Console. **Never invent endpoints, scopes or prices.**
- A change would add spend (X API, AI, hosting) beyond what the user approved.
- A new dependency, service or infrastructure piece is needed that isn't already approved.

## Stack

Next.js (App Router) · React · TypeScript `strict` · Tailwind · PostgreSQL + Prisma (Supabase Postgres/Storage if practical) · Next Route Handlers / Server Actions + service layer · Zod · Vitest · React Testing Library · TanStack Query only for genuinely interactive client state.

Auth provider, scheduler and hosting are chosen after Milestone 0 — check `docs/decisions.md` before assuming.

**Explicitly out:** NestJS, Redis/BullMQ, billing/plans, team UI/roles, multi-account-per-workspace UI, generic AI frameworks. Don't add them "for later".

## Architecture

```
src/
  app/                 # routes, pages, route handlers — thin: parse → authorize → call service → map result
  features/<domain>/   # UI components + hooks per domain (compose, media, schedule, inbox, analytics)
  server/
    services/          # business logic; pure-ish, testable, no Next/HTTP types
    repositories/      # Prisma access; every query scoped by workspaceId
    integrations/x/    # typed X client, Zod schemas for X responses, error mapping
    integrations/ai/   # thin provider seam (one interface, env-configured vendor/model)
    jobs/              # processDueActions(now, batchSize) — independent of the trigger
    auth/              # session, current-workspace helper, crypto for tokens
  lib/                 # shared utils (time, result types, logger) — no business logic
prisma/                # schema, migrations, seed
docs/                  # decisions.md, api-matrix, runbooks
```

Principles:
- **Layering:** route → service → repository/integration. Routes never touch Prisma or the X client directly. Services never import `next/*`.
- **Domain types ≠ X types.** Map raw X responses to internal types at the integration boundary; the rest of the app never sees raw X payloads.
- **Jobs are trigger-agnostic.** `processDueActions` must work from cron, a manual endpoint, or a test with identical semantics.
- **Ownership model:** `User → Workspace → XAccount`. Every user-owned row has an explicit `workspaceId` (and `xAccountId` where relevant) with indexes and unique constraints enforcing it.
- **Server Components by default;** `"use client"` only where interactivity requires it.
- Prefer boring, explicit code over clever generics. Add an abstraction only at the second real use case.

## TypeScript & code style

- `strict: true`, plus `noUncheckedIndexedAccess`. **No `any`** (use `unknown` + narrowing), no `@ts-ignore` without a comment explaining why; no non-null `!` to silence the compiler.
- **Zod at every external boundary:** request bodies/params, env vars (validated once at startup), X API responses, AI outputs, webhook/cron input. Infer types from schemas (`z.infer`), don't duplicate them.
- Small, single-purpose functions; early returns; descriptive names (`scheduledAtUtc`, not `d`).
- Expected failures are values, not exceptions: return a discriminated union (`{ ok: true, data } | { ok: false, error }`) from services for domain errors; throw only for truly unexpected states.
- Typed error codes (e.g. `X_RATE_LIMITED`, `X_AUTH_EXPIRED`, `X_WRITE_UNKNOWN`) mapped to user-facing messages in one place.
- Money as integer micro-units (or `Decimal`), never floats. Times as UTC `Date`/`timestamptz`; user timezone stored as IANA string alongside.
- Comments explain *why*, not *what*. No commented-out code.
- Match existing patterns in the codebase before introducing new ones.

## Security & privacy

Full model and deploy checklist: [docs/security.md](docs/security.md) — keep it in sync when auth, tokens or X calls change.

- **Authorize every read and mutation** via the current-workspace helper; repository functions require `workspaceId`. No unbounded queries — always `where` by owner + pagination/limit.
- Test **cross-workspace IDOR** for every new resource type (user A cannot read/mutate B's media, posts, jobs, tokens, candidates, metrics, usage).
- X OAuth 2.0 with **state + PKCE**, minimal scopes; the callback must bind the X account to the initiating user's workspace only.
- OAuth tokens **encrypted at rest** (AES-256-GCM, key versioning for rotation); decrypted only in server code at call time.
- Secrets live in env only; `.env.example` lists every variable with placeholder values; never commit `.env*` with real values. Nothing secret in client bundles (`NEXT_PUBLIC_*` only for truly public values).
- **Never log** tokens, API keys, auth headers, full request bodies with credentials, or private media URLs. Structured logs with `actionId`/`workspaceId`, not PII.
- Cron/worker endpoint protected by a server-side secret (constant-time compare); due-job selection happens server-side.
- Media private by default; access via short-lived signed URLs; validate type/size server-side; delete storage objects when records are deleted.
- **Prompt-injection resistance:** X post text is untrusted data. It goes into prompts as clearly delimited content, never as instructions; AI output is validated with Zod and cannot trigger tools or publishing.

## Scheduling & write safety

- State machine: `DRAFT → SCHEDULED → PROCESSING → PUBLISHED | FAILED | UNKNOWN` (+ `CANCELLED`). Transitions are explicit and validated in one place.
- **Atomic claim with lease** (`UPDATE ... WHERE status='SCHEDULED' AND runAt<=now RETURNING` or equivalent) so competing workers never double-process.
- Every attempt writes an `ActionAttempt` audit row (start, end, outcome, X ids, error code).
- **Ambiguous writes (timeout / network error after send) → never blind-retry.** Reconcile via an available read; if still unknown, set `UNKNOWN` and require manual review. Retry only definite, retryable failures.
- Local unique keys prevent duplicate processing but do not provide end-to-end X idempotency — don't pretend otherwise.
- Disconnecting an X account stops its pending jobs. Budget exhaustion stops new *background reads/AI calls*; scheduled writes are never silently dropped — the user is notified.
- UI shows the **real** scheduling precision of the chosen scheduler.

## Costs

- Track every X API call and AI call in `ExternalUsage` (operation, units, estimated cost, workspace, timestamp).
- Enforce per-workspace budget guardrails server-side before background reads/AI calls.
- Local cost figures are estimates; label them so. The X Developer Console is the source of truth.
- Prefer on-demand / manual-URL flows over continuous polling unless the economics are verified and approved.

## Testing

- Vitest for services, repositories (against a real test Postgres, not mocks of Prisma), jobs and X/AI integration mapping. RTL for meaningful UI behavior, not snapshots.
- X and AI are **always mocked** in tests (fixtures validated by the same Zod schemas). No network in the test suite.
- Must-cover risky behavior: cross-workspace denial, OAuth state/PKCE & account binding, competing workers, lease expiry, timeout → `UNKNOWN`, cancel/edit races, timezone & DST, double-click publish, "discovery/AI completion cannot publish", budget stop.
- Tests are deterministic: inject `now`, no real timers/sleeps, no order dependence.
- A bug fix comes with a regression test.

## UI/UX

- Every screen has explicit **loading, empty and error** states; errors are actionable ("Reconnect X account"), not stack traces.
- Destructive/outward actions (Publish, Repost, Disconnect) are explicit, show exactly what will be sent, and are protected from double submission.
- Show times in the user's timezone with the zone visible; show unavailable metrics as "unavailable", never as `0`.
- Accessible by default: semantic HTML, labels, keyboard navigation, focus states.

## Database & migrations

- Every schema change goes through a Prisma migration; never edit applied migrations.
- Add indexes for every foreign key and every query filter used by jobs/lists; add unique constraints for business invariants (e.g. one reply per candidate per account, one Repost per post per schedule window).
- Seed script creates two isolated users/workspaces for local development.

## Git

- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`), imperative, scoped to one logical change.
- No `Co-Authored-By` / Claude attribution lines in commit messages (user preference).
- Commit or push only when the user asks. Never commit secrets, `.env`, credentials, or real user media.

## Definition of done (per task)

- [ ] Flow works locally with loading/empty/error states
- [ ] Server authorizes ownership before every read/mutation
- [ ] Risky behavior covered by tests; `typecheck`, `lint`, `test` (and `build` when relevant) pass — output reported
- [ ] Migrations and `.env.example` accurate; no secrets in repo
- [ ] `IMPLEMENTATION_LOG.md` updated (decision, limitation, measured cost, next task); `docs/decisions.md` updated if a decision was made
- [ ] Diff summary shown to the user; waiting for approval before the next task

## Commands

Package manager: **pnpm**. Node ≥ 22. Local Postgres 17 via Homebrew (`brew services start postgresql@17`), databases `x_manager_dev` and `x_manager_test`.

```bash
pnpm install          # also runs prisma generate (client → src/generated/prisma, gitignored)
pnpm dev              # http://127.0.0.1:3000 — use 127.0.0.1, not localhost (X OAuth callback + cookies)
pnpm check            # typecheck + lint + format:check + test — run before reporting a task done
pnpm typecheck        # next typegen && tsc --noEmit
pnpm lint             # eslint
pnpm format           # prettier --write
pnpm test             # vitest run (DATABASE_URL is forced to TEST_DATABASE_URL)
pnpm build            # next build
pnpm db:migrate       # prisma migrate dev (reads .env.local via prisma.config.ts)
pnpm db:status        # prisma migrate status
pnpm db:seed          # two isolated seed users + workspaces (dev DB only)
pnpm jobs:run         # trigger the Repost job once against the local server (dry run unless X_WRITES_ENABLED=true)
pnpm prod:migrate     # prisma migrate deploy on Supabase (reads .env.production.local)
pnpm prod:setup       # idempotent Supabase setup: Data API lockdown, Vault cron secret, pg_cron job
pnpm prod:env         # push production env vars to Vercel as Sensitive (then redeploy)
```

Stack notes:
- **Next.js 16** — APIs differ from older versions; read `node_modules/next/dist/docs/` before using a Next API (see AGENTS.md).
- **Prisma 7** — config in `prisma.config.ts`, generator `prisma-client`, import the client from `@/generated/prisma/client`, connect via `@prisma/adapter-pg`. Keep `prisma` and `@prisma/client` on the same exact version.
- **Zod 4** — use top-level format schemas (`z.url()`, `z.email()`), not deprecated `z.string().url()`.
- **Better Auth 1.7** — app login (Google) in `src/server/auth/auth.ts`; access = `SUPERADMIN_EMAILS` (env, owner, role SUPERADMIN) or an active invite in `access_invite` (D-025), enforced in database hooks (user + session create) and again in `requireWorkspace()`. Pages/actions get the workspace only via `requireWorkspace()` (returns `role`) or `requireSuperadmin()` (404 for others) from `src/server/auth/session.ts`.
- Tests: `tests/integration/*` hit the real test DB (migrated in `tests/setup/global-setup.ts`, reset via `tests/helpers/db.ts`); files run sequentially.
- **Production:** Vercel project `x-manager` (fra1), https://x-manager-ek.vercel.app, auto-deploy on push to `main`; Supabase Postgres (Frankfurt) via transaction pooler; pg_cron → `POST /api/jobs/run` every 5 min. Production secrets live only in `.env.production.local` (gitignored) and Vercel. New migrations: run `pnpm prod:migrate` **before** pushing code that needs them.
- Env: `.env.local` (gitignored) for all local values; `.env.example` is the documented template; validated in `src/lib/env.ts`.
