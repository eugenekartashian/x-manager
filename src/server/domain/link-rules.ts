// Tracked links (D-039): short /l/<code> links that count human clicks and redirect.

export const MAX_LINKS_PER_WORKSPACE = 200;
export const MAX_LABEL_LENGTH = 80;
export const MAX_DESTINATION_LENGTH = 500;
export const CODE_LENGTH = 6;
export const LINK_PATH_PREFIX = "/l/";

const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/l/I

/** Random short code from the given random bytes (one byte per character). */
export function codeFromBytes(bytes: Uint8Array): string {
  return Array.from(
    bytes.slice(0, CODE_LENGTH),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((char) => CODE_ALPHABET.includes(char));
}

// Link-preview crawlers (X fetches every link for its card), search bots and scripts.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|vkshare|pinterest|quora|curl|wget|python|httpclient|okhttp|go-http|java\/|headless|lighthouse|monitor/i;

/** Clicks from bots are not counted (they still get redirected). */
export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

export type Device = "phone" | "tablet" | "desktop";

export function deviceOf(userAgent: string): Device {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "phone";
  return "desktop";
}

/**
 * Where a link may point: https only, no credentials, and never back to our own link
 * path (a loop). Returns the normalised URL or null.
 */
export function normaliseDestination(raw: string, appHost: string): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_DESTINATION_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) {
    return null;
  }
  if (url.host === appHost && url.pathname.startsWith(LINK_PATH_PREFIX)) return null;
  return url.toString();
}
