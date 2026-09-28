import "server-only";
import type { z } from "zod";
import { codeForStatus, XApiError } from "./errors";

export const X_API_BASE = "https://api.x.com";
const TIMEOUT_MS = 10_000;

type XRequest = {
  method: "GET" | "POST" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: URLSearchParams | string;
};

/** Performs one request to X and parses the JSON body with `schema`. Never retries. */
export async function xRequest<S extends z.ZodType>(
  request: XRequest,
  schema: S,
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new XApiError("X_NETWORK", null);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const oauthError =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : undefined;
    throw new XApiError(
      codeForStatus(response.status, oauthError),
      response.status,
      parseRateLimitReset(response.headers),
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new XApiError("X_BAD_RESPONSE", response.status);
  return parsed.data;
}

function parseRateLimitReset(headers: Headers): Date | null {
  const reset = Number(headers.get("x-rate-limit-reset"));
  return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null;
}
