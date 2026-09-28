import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const localEnv = config({ path: ".env.local", quiet: true }).parsed ?? {};

const testDatabaseUrl =
  process.env["TEST_DATABASE_URL"] ??
  localEnv["TEST_DATABASE_URL"] ??
  "postgresql://localhost:5432/x_manager_test";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React Server Components runtime.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    // Integration tests share one database and reset it between tests.
    fileParallelism: false,
    // Tests never touch the dev database or real credentials.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      APP_URL: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-test-secret-test-secret-00",
      AUTH_GOOGLE_ID: "test-google-id",
      AUTH_GOOGLE_SECRET: "test-google-secret",
      ALLOWED_EMAILS: "owner-a@example.com,owner-b@example.com",
      X_CLIENT_ID: "test-x-client-id",
      X_CLIENT_SECRET: "test-x-client-secret",
      X_REDIRECT_URI: "http://127.0.0.1:3000/api/x/oauth/callback",
      // Test-only key (32 zero bytes), never used outside tests.
      TOKEN_ENCRYPTION_KEYS: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      TOKEN_ENCRYPTION_CURRENT: "v1",
    },
  },
});
