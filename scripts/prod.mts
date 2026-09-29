// Production helpers that read secrets from .env.production.local and pass them to
// tools via env/stdin — secrets are never printed or typed into a chat.
//   pnpm prod:migrate  → prisma migrate deploy against Supabase (session pooler URL)
//   pnpm prod:setup    → scripts/supabase-setup.sql (RLS lockdown, Vault secret, pg_cron)
//   pnpm prod:env [NAME…] → push env vars (all, or only NAME…) to the linked Vercel project
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const prod = config({ path: ".env.production.local", quiet: true, processEnv: {} }).parsed ?? {};

function required(name: string): string {
  const value = prod[name];
  if (!value) throw new Error(`${name} is empty in .env.production.local`);
  return value;
}

function run(
  command: string,
  args: string[],
  options: { env?: Record<string, string>; input?: string } = {},
) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...options.env },
    input: options.input,
    stdio: [options.input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args[0] ?? ""} failed (exit ${result.status})`);
}

// Values the app needs at build and run time (see src/lib/env.ts).
const APP_ENV = [
  "DATABASE_URL",
  "APP_URL",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "ALLOWED_EMAILS",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_REDIRECT_URI",
  "TOKEN_ENCRYPTION_KEYS",
  "TOKEN_ENCRYPTION_CURRENT",
  "CRON_SECRET",
  "X_WRITES_ENABLED",
] as const;

// Optional: pushed only when set (AI reply ideas stay off without a key).
const OPTIONAL_ENV = ["ANTHROPIC_API_KEY", "AI_MODEL"] as const;

const command = process.argv[2];

if (command === "migrate") {
  run("pnpm", ["prisma", "migrate", "deploy"], {
    env: { DATABASE_URL: required("MIGRATE_DATABASE_URL") },
  });
} else if (command === "setup") {
  const psql = process.env["PSQL"] ?? "/opt/homebrew/opt/postgresql@17/bin/psql";
  run(psql, [
    required("MIGRATE_DATABASE_URL"),
    "-q",
    "-v",
    `app_url=${required("APP_URL")}`,
    "-v",
    `cron_secret=${required("CRON_SECRET")}`,
    "-f",
    "scripts/supabase-setup.sql",
  ]);
} else if (command === "env") {
  const only = process.argv.slice(3);
  const known: readonly string[] = [...APP_ENV, ...OPTIONAL_ENV];
  const unknown = only.filter((name) => !known.includes(name));
  if (unknown.length) throw new Error(`Unknown variable(s): ${unknown.join(", ")}`);
  for (const name of only.length ? only : [...APP_ENV, ...OPTIONAL_ENV]) {
    const optional = (OPTIONAL_ENV as readonly string[]).includes(name);
    if (optional && !prod[name]) {
      console.log(`– ${name} (empty, skipped)`);
      continue;
    }
    const value = required(name);
    // Replace any existing value; stdin keeps the secret out of argv and logs.
    spawnSync("pnpm", ["dlx", "vercel", "env", "rm", name, "production", "--yes"], {
      stdio: "ignore",
    });
    run("pnpm", ["dlx", "vercel", "env", "add", name, "production", "--sensitive"], {
      input: value,
    });
    console.log(`✓ ${name}`);
  }
} else {
  console.error("Usage: tsx scripts/prod.mts <migrate|setup|env>");
  process.exit(1);
}
