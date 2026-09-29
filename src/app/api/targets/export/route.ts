import { requireWorkspace } from "@/server/auth/session";
import { exportTargetsCsv } from "@/server/services/targets";

// CSV download of the signed-in workspace's target list (opens in Excel).
export async function GET() {
  const { workspace } = await requireWorkspace();
  const csv = await exportTargetsCsv(workspace.id, workspace.timezone);
  const date = new Date().toISOString().slice(0, 10);
  // BOM so Excel detects UTF-8 (emoji, accents in names/bios).
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="x-targets-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
