// Parses @handles pasted by the user — one per line, or separated by commas/spaces,
// with or without "@", or as x.com / twitter.com profile links (e.g. a column copied
// from Excel or Google Sheets).

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const PROFILE_URL =
  /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i;

export type ParsedHandles = { handles: string[]; invalid: string[] };

export function parseHandles(input: string): ParsedHandles {
  const handles = new Map<string, string>(); // lowercased → as typed
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    const token = raw.trim().replace(/^["']|["']$/g, "");
    if (!token) continue;
    const handle = PROFILE_URL.exec(token)?.[1] ?? token.replace(/^@/, "");
    if (HANDLE.test(handle)) {
      if (!handles.has(handle.toLowerCase())) handles.set(handle.toLowerCase(), handle);
    } else {
      invalid.push(token);
    }
  }
  return { handles: [...handles.values()], invalid };
}
