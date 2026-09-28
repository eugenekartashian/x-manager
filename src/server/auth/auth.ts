import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { isEmailAllowed } from "@/lib/allowlist";
import { env } from "@/lib/env";
import { prisma } from "@/server/db";
import { ensureWorkspaceForOwner } from "@/server/repositories/workspaces";

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
          assertAllowed(user.email);
        },
        after: async (user) => {
          await ensureWorkspaceForOwner(user.id, user.name);
        },
      },
    },
    session: {
      create: {
        // Re-checked on every sign-in so removing an email from the allowlist takes effect.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { email: true },
          });
          assertAllowed(user?.email);
        },
      },
    },
  },
});

function assertAllowed(email: string | undefined): void {
  if (!email || !isEmailAllowed(email, env.ALLOWED_EMAILS)) {
    throw new APIError("FORBIDDEN", { message: "This email is not allowed to sign in." });
  }
}
