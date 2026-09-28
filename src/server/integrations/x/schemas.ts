import { z } from "zod";

export const tokenResponseSchema = z.object({
  token_type: z.string(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string(),
});
export type XTokenResponse = z.infer<typeof tokenResponseSchema>;

export const meResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    name: z.string(),
  }),
});

export const revokeResponseSchema = z.object({ revoked: z.boolean() });
