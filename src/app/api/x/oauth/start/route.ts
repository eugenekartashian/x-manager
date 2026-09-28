import { NextResponse } from "next/server";
import { requireWorkspace } from "@/server/auth/session";
import { startXConnection } from "@/server/services/x-connection";
import { OAUTH_COOKIE, oauthCookieOptions } from "../cookie";

export async function GET() {
  const { user, workspace } = await requireWorkspace();
  const { authorizeUrl, sealedState } = startXConnection({
    userId: user.id,
    workspaceId: workspace.id,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_COOKIE, sealedState, oauthCookieOptions);
  return response;
}
