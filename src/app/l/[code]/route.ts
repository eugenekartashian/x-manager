import { NextResponse } from "next/server";
import { resolveClick } from "@/server/services/links";

// Public tracked-link redirect (D-039). No sign-in: the code is the only key.
export async function GET(request: Request, { params }: RouteContext<"/l/[code]">) {
  const { code } = await params;
  const headers = request.headers;
  const destination = await resolveClick({
    code,
    userAgent: headers.get("user-agent"),
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    country: headers.get("x-vercel-ip-country"),
  });
  if (!destination) {
    return new NextResponse("Link not found.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
    });
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-robots-tag", "noindex");
  return response;
}
