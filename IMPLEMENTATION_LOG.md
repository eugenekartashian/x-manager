# Implementation Log

Newest entry first. Each entry: what changed, key decisions, verification, limitations, costs, next task.

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
