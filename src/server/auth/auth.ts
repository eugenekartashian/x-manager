import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { ensureWorkspaceForOwner } from "@/server/repositories/workspaces";
import { hasAppAccess, resolveAccess } from "@/server/services/access";

// App login only (Google). The X account is connected separately via X OAuth.
export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      prompt: "select_account",
    },
  },
  account: { encryptOAuthTokens: true },
  telemetry: { enabled: false },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await hasAppAccess(user.email))) forbidden();
        },
        after: async (user) => {
          await ensureWorkspaceForOwner(user.id, user.name);
        },
      },
    },
    session: {
      create: {
        // Re-checked on every sign-in (revoked invites take effect); also syncs the role.
        before: async (session) => {
          if (!(await resolveAccess(session.userId))) forbidden();
        },
      },
    },
  },
});

function forbidden(): never {
  throw new APIError("FORBIDDEN", { message: "This email is not allowed to sign in." });
}
