import "server-only";
import { X_API_BASE, xRequest } from "./http";
import { meResponseSchema } from "./schemas";

export type XUser = { id: string; username: string; name: string };

/** GET /2/users/me — billable (one User resource). */
export async function getMe(accessToken: string): Promise<XUser> {
  const { data } = await xRequest(
    {
      method: "GET",
      url: `${X_API_BASE}/2/users/me`,
      headers: { authorization: `Bearer ${accessToken}` },
    },
    meResponseSchema,
  );
  return { id: data.id, username: data.username, name: data.name };
}
