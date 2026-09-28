import "server-only";
import { z } from "zod";

// Server-side environment, validated once on first import.
// Extend this schema in the task that starts using a variable (see .env.example).
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only — never values, they may be secrets.
    const invalid = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server environment variables: ${invalid}`);
  }
  return result.data;
}

export const env = parseServerEnv(process.env);
