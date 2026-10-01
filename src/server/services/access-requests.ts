import "server-only";
import { z } from "zod";
import type { AccessRequest } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/allowlist";
import { err, ok, type Result } from "@/lib/result";
import * as requests from "@/server/repositories/access-requests";
import { hasAppAccess, inviteUser } from "@/server/services/access";

// Public "Want to try" form → pending request → superadmin invites or dismisses (D-032).

/** Upper bound on pending requests, so the public form can't fill the database. */
export const MAX_PENDING_REQUESTS = 1_000;

const requestSchema = z.object({
  email: z.email().max(254),
  xHandle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .pipe(z.union([z.literal(""), z.string().regex(/^[A-Za-z0-9_]{1,15}$/)]))
    .optional(),
  message: z.string().trim().max(500).optional(),
});

export type RequestError = "invalid_email" | "invalid_handle" | "too_long" | "full";

export async function requestAccess(input: {
  email: string;
  xHandle?: string;
  message?: string;
}): Promise<Result<null, RequestError>> {
  const parsed = requestSchema.safeParse({ ...input, email: normalizeEmail(input.email) });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return err(
      field === "xHandle" ? "invalid_handle" : field === "message" ? "too_long" : "invalid_email",
    );
  }
  // Already has access: answer the same way, without revealing who is a user.
  if (await hasAppAccess(parsed.data.email)) return ok(null);
  if ((await requests.countRequests()) >= MAX_PENDING_REQUESTS) return err("full");
  await requests.upsertRequest({
    email: parsed.data.email,
    xHandle: parsed.data.xHandle || null,
    message: parsed.data.message || null,
  });
  return ok(null);
}

export function listAccessRequests(): Promise<AccessRequest[]> {
  return requests.listRequests();
}

/** Superadmin: invite the requester (their Google email) and drop the request. */
export async function approveRequest(
  id: string,
  invitedById: string,
): Promise<Result<{ email: string }, "not_found" | "invalid_email" | "already_superadmin">> {
  const request = await requests.findRequest(id);
  if (!request) return err("not_found");
  const invited = await inviteUser(invitedById, request.email);
  if (!invited.ok) return invited;
  await requests.deleteRequest(id);
  return ok({ email: invited.data.email });
}

export async function dismissRequest(id: string): Promise<Result<null, "not_found">> {
  return (await requests.deleteRequest(id)) ? ok(null) : err("not_found");
}
