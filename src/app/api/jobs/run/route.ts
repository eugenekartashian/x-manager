import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueReposts } from "@/server/jobs/process-due-reposts";
import { purgeStaleTargetPosts } from "@/server/jobs/purge-stale-content";
import { expireStaleMessaged } from "@/server/services/repost-checks";

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
  // Automatic repost checks are OFF until the owner approves a schedule (they cost money);
  // only "Check now" reads X. Expiring stale "Messaged" creators is free.
  const repostChecks = { expired: await expireStaleMessaged(now) };
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
