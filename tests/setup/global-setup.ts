import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Apply all migrations to the test database once per run.
export default function setup(project: TestProject): void {
  const url = project.config.env["DATABASE_URL"];
  if (typeof url !== "string" || !/x_manager_test/.test(url)) {
    throw new Error("Refusing to migrate: DATABASE_URL does not point to the test database.");
  }
  execSync("pnpm prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
