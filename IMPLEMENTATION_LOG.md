# Implementation Log

Newest entry first. Each entry: what changed, key decisions, verification, limitations, costs, next task.

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
