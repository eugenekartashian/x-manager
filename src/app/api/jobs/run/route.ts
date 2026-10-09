import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueReposts } from "@/server/jobs/process-due-reposts";
import { purgeStaleTargetPosts } from "@/server/jobs/purge-stale-content";
import { runDailyRepostChecks } from "@/server/services/repost-checks";

// Called by the scheduler (Supabase pg_cron → pg_net) every few minutes.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const now = new Date();
  const summary = await processDueReposts(now, { writesEnabled: env.X_WRITES_ENABLED });
  const purgedTargetPosts = await purgeStaleTargetPosts(now);
  // Reads only (never reposts); each promoted post is checked at most every 20 h.
  const repostChecks = await runDailyRepostChecks(now);
  return NextResponse.json(
    { ...summary, purgedTargetPosts, repostChecks },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isAuthorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
