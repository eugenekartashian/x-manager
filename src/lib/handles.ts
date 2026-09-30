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

/** First path segments on x.com that are not usernames. */
const RESERVED_PATHS = new Set([
  "i",
  "home",
  "search",
  "explore",
  "notifications",
  "messages",
  "settings",
  "intent",
  "hashtag",
  "share",
  "compose",
  "login",
  "signup",
  "tos",
  "privacy",
]);

const SHARED_URL =
  /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?=[/?#\s]|$)/i;

/**
 * The account behind something shared from the X app or a browser (M3.5 quick add):
 * a profile link, a post link (x.com/<user>/status/<id>) or text with an @handle.
 * Returns null when there is no username in it (e.g. x.com/i/status/<id>).
 */
export function handleFromShared(...parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join(" ");
  const fromUrl = SHARED_URL.exec(text)?.[1];
  if (fromUrl && !RESERVED_PATHS.has(fromUrl.toLowerCase())) return fromUrl;
  const mention = /(?:^|[\s(])@([A-Za-z0-9_]{1,15})\b/.exec(text)?.[1];
  return mention ?? null;
}
