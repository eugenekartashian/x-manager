import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const localEnv = config({ path: ".env.local", quiet: true }).parsed ?? {};

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
    // Tests never touch the dev database.
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env["TEST_DATABASE_URL"] ??
        localEnv["TEST_DATABASE_URL"] ??
        "postgresql://localhost:5432/x_manager_test",
    },
  },
});
