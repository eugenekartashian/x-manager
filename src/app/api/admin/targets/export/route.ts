import { requireSuperadmin } from "@/server/auth/session";
import { exportTargetPopularityCsv } from "@/server/services/admin";

// Superadmin-only CSV: public accounts users added as targets, with how many users added each.
export async function GET() {
  await requireSuperadmin();
  const csv = await exportTargetPopularityCsv();
  const date = new Date().toISOString().slice(0, 10);
  // BOM so Excel detects UTF-8.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="all-targets-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
