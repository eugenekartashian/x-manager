import "server-only";
import { z } from "zod";
import { parseAllowlist } from "./allowlist";

/** Empty strings in .env files mean "not set". */
const optionalString = z
  .string()
  .optional()
  .transform((value) => value || undefined);

// Server-side environment, validated once on first import.
// Extend this schema in the task that starts using a variable (see .env.example).
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_URL: z.url({ protocol: /^https?$/ }),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  // Owner(s): always allowed, role SUPERADMIN. Everyone else needs an invite (D-025).
  SUPERADMIN_EMAILS: z
    .string()
    .transform(parseAllowlist)
    .pipe(z.array(z.email()).min(1, "at least one email is required")),
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  X_REDIRECT_URI: z.url({ protocol: /^https?$/ }),
  // Parsed and validated as a key ring in src/server/keyring.ts.
  TOKEN_ENCRYPTION_KEYS: z.string().min(1),
  TOKEN_ENCRYPTION_CURRENT: z.string().regex(/^v\d+$/),
  // Bearer secret for POST /api/jobs/run (called by the scheduler).
  CRON_SECRET: z.string().min(32),
  // Kill switch for writes to X (Reposts). Off by default: the job runs as a dry run.
  X_WRITES_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Optional app-wide cap on estimated API spend per UTC month, all users together (M6.3).
  // Unset = only per-user budgets apply. Keep it ≤ the X Developer Console spend cap.
  GLOBAL_MONTHLY_BUDGET_USD: optionalString
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .pipe(z.number().positive().max(10_000).optional()),
  // AI reply ideas (optional — off without the selected provider's key). D-021.
  AI_PROVIDER: z.enum(["anthropic", "openai"]).default("openai"),
  AI_MODEL: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only — never values, they may be secrets.
    const invalid = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(
      ", ",
    );
    throw new Error(`Invalid server environment variables: ${invalid}`);
  }
  return result.data;
}

export const env = parseServerEnv(process.env);
