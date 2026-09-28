import { env } from "@/lib/env";
import { OAUTH_STATE_TTL_MS } from "@/server/services/x-connection";

export const OAUTH_COOKIE = "x_oauth_state";

export const oauthCookieOptions = {
  httpOnly: true,
  secure: env.APP_URL.startsWith("https://"),
  sameSite: "lax" as const, // must survive the top-level redirect back from x.com
  path: "/api/x/oauth",
  maxAge: OAUTH_STATE_TTL_MS / 1000,
};
