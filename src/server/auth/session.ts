import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Workspace } from "@/generated/prisma/client";
import { isEmailAllowed } from "@/lib/allowlist";
import { env } from "@/lib/env";
import { auth } from "@/server/auth/auth";
import { ensureWorkspaceForOwner, findWorkspaceByOwner } from "@/server/repositories/workspaces";

export type CurrentUser = { id: string; email: string; name: string; image: string | null };

export type WorkspaceContext = { user: CurrentUser; workspace: Workspace };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name, image } = session.user;
  return { id, email, name, image: image ?? null };
});

/**
 * Entry point for every authenticated page, action and route handler.
 * Returns the signed-in user and *their* workspace; all data access must be
 * scoped by `workspace.id` from this result, never by ids from the request.
 */
export const requireWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  // Existing sessions lose access as soon as the email leaves the allowlist.
  if (!isEmailAllowed(user.email, env.ALLOWED_EMAILS)) redirect("/sign-in?error=forbidden");

  const workspace =
    (await findWorkspaceByOwner(user.id)) ?? (await ensureWorkspaceForOwner(user.id, user.name));
  return { user, workspace };
});
