"use client";

import { useRef, useState } from "react";
import { parseHandles } from "@/lib/handles";
import { addTargetsAction } from "./actions";

const BATCH = 100; // one X lookup call takes at most 100 handles

/**
 * Import creators from .xlsx / .csv / .txt (M7.1). The file is read in the browser; only the
 * @handles found in it are sent, in batches. Accounts already in the list are skipped before
 * any X lookup, so they cost nothing.
 */
export function ImportFile() {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: "info" | "error"; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setStatus({ tone: "info", lines: [`Reading ${file.name}…`] });
    try {
      const cells = /\.xlsx$/i.test(file.name) ? await readXlsxCells(file) : [await file.text()];
      const { handles } = parseHandles(cells.join("\n"));
      if (handles.length === 0) {
        setStatus({
          tone: "error",
          lines: ["No @usernames or x.com profile links found in this file."],
        });
        return;
      }
      const lines = [`Found ${handles.length} account${handles.length === 1 ? "" : "s"}.`];
      setStatus({ tone: "info", lines });
      for (let start = 0; start < handles.length; start += BATCH) {
        const formData = new FormData();
        formData.set("handles", handles.slice(start, start + BATCH).join("\n"));
        formData.set("source", "IMPORT");
        const result = await addTargetsAction({ status: "idle", message: "" }, formData);
        lines.push(result.message);
        setStatus({
          tone: result.status === "error" && start === 0 ? "error" : "info",
          lines: [...lines],
        });
        if (result.status === "error" && /full|budget|limit|not enabled/i.test(result.message))
          break;
      }
    } catch {
      setStatus({ tone: "error", lines: ["Could not read this file. Use .xlsx, .csv or .txt."] });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="border-foreground/15 hover:bg-foreground/5 flex cursor-pointer items-center justify-center gap-2 self-start rounded-md border px-3 py-1.5 text-sm">
        {busy ? "Importing…" : "Import file (.xlsx, .csv)"}
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="sr-only"
        />
      </label>
      {status && (
        <ul
          role="status"
          className={`rounded-md px-3 py-2 text-xs ${
            status.tone === "error"
              ? "bg-red-500/10 text-red-700 dark:text-red-400"
              : "bg-foreground/5"
          }`}
        >
          {status.lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Every string cell of every sheet (the handles can be in any column). */
async function readXlsxCells(file: File): Promise<string[]> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  return sheets.flatMap((sheet) =>
    sheet.data.flatMap((row) => row.filter((cell): cell is string => typeof cell === "string")),
  );
}
