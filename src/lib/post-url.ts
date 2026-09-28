// Parses a link to an X post (or a bare post id) into its post id.
// Accepts x.com / twitter.com (+ www., mobile.), with or without scheme, query or
// trailing segments like /photo/1. The username in the URL is informational only —
// ownership is always verified through the API.

const HOSTS = new Set([
  "x.com",
  "twitter.com",
  "www.x.com",
  "www.twitter.com",
  "mobile.x.com",
  "mobile.twitter.com",
]);
const POST_ID = /^\d{1,19}$/;

export type ParsedPostUrl = { postId: string; username: string | null };

export function parsePostUrl(input: string): ParsedPostUrl | null {
  const value = input.trim();
  if (POST_ID.test(value)) return { postId: value, username: null };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const [username, status, postId] = url.pathname.split("/").filter(Boolean);
  if (
    !username ||
    (status !== "status" && status !== "statuses") ||
    !postId ||
    !POST_ID.test(postId)
  ) {
    return null;
  }
  return { postId, username: username === "i" ? null : username };
}
