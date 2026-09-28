import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/server/auth/session";
import { completeXConnection } from "@/server/services/x-connection";
import { OAUTH_COOKIE, oauthCookieOptions } from "../cookie";

export async function GET(request: NextRequest) {
  const { user, workspace } = await requireWorkspace();
  const query = request.nextUrl.searchParams;

  const result = await completeXConnection(
    { userId: user.id, workspaceId: workspace.id },
    {
      code: query.get("code") ?? undefined,
      state: query.get("state") ?? undefined,
      error: query.get("error") ?? undefined,
    },
    request.cookies.get(OAUTH_COOKIE)?.value,
  );

  const target = new URL("/dashboard", env.APP_URL);
  if (result.ok) target.searchParams.set("x", "connected");
  else target.searchParams.set("x_error", result.error);

  const response = NextResponse.redirect(target);
  // One-time state: always clear it, success or not.
  response.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
  return response;
}
