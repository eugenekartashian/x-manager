import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueReposts } from "@/server/jobs/process-due-reposts";

// Called by the scheduler (Supabase pg_cron → pg_net) every few minutes.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const summary = await processDueReposts(new Date(), { writesEnabled: env.X_WRITES_ENABLED });
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}

function isAuthorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
