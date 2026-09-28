import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dev only: send http://localhost:3000 to the canonical APP_URL host (127.0.0.1).
// Auth cookies and OAuth callbacks are bound to one origin; mixing the two breaks sign-in.
export function proxy(request: NextRequest) {
  const appUrl = process.env["APP_URL"];
  if (process.env.NODE_ENV !== "development" || !appUrl) return NextResponse.next();

  const canonical = new URL(appUrl);
  // Compare the Host header: in dev, nextUrl carries the server's own hostname.
  if (request.headers.get("host") === canonical.host) return NextResponse.next();

  const target = escapeHtml(
    new URL(request.nextUrl.pathname + request.nextUrl.search, canonical).toString(),
  );
  // Not a 3xx: Next treats localhost and 127.0.0.1 as the same host and would
  // rewrite the Location header into a relative path, looping back to localhost.
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Redirecting…</title><p>Opening <a href="${target}">${target}</a> — sign-in works only on this address.</p>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html" } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
