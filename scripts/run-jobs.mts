// Dev helper: trigger the Repost job once against the local server (`pnpm dev` must run).
// Respects X_WRITES_ENABLED — with "false" it only records a dry run.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const appUrl = process.env["APP_URL"] ?? "http://127.0.0.1:3000";
const secret = process.env["CRON_SECRET"];
if (!secret) throw new Error("CRON_SECRET is not set in .env.local");

const response = await fetch(new URL("/api/jobs/run", appUrl), {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});
console.log(response.status, await response.text());
