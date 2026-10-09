import { NextResponse } from "next/server";
import { requireWorkspace } from "@/server/auth/session";
import { startXConnection } from "@/server/services/x-connection";
import { OAUTH_COOKIE, oauthCookieOptions } from "../cookie";

export async function GET() {
  const { user, workspace, role } = await requireWorkspace();
  const { authorizeUrl, sealedState } = startXConnection(
    { userId: user.id, workspaceId: workspace.id },
    new Date(),
    // DM sending is a superadmin-only experiment (D-034).
    { directMessages: role === "SUPERADMIN" },
  );

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_COOKIE, sealedState, oauthCookieOptions);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
