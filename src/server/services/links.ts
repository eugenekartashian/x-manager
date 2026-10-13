import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/result";
import {
  codeFromBytes,
  CODE_LENGTH,
  deviceOf,
  isBot,
  isValidCode,
  LINK_PATH_PREFIX,
  MAX_LABEL_LENGTH,
  MAX_LINKS_PER_WORKSPACE,
  normaliseDestination,
} from "@/server/domain/link-rules";
import * as links from "@/server/repositories/links";

// Tracked links (D-039): free — no X API, one row per human click. Nothing about the
// visitor is stored except country, device type and a per-day salted hash for uniques.

export type CreateLinkError = "empty_label" | "invalid_destination" | "too_many";

export function linkUrl(code: string): string {
  return new URL(`${LINK_PATH_PREFIX}${code}`, env.APP_URL).toString();
}

export async function createTrackedLink(
  workspaceId: string,
  input: { label: string; destination: string },
): Promise<Result<{ code: string; url: string }, CreateLinkError>> {
  const label = input.label.trim().slice(0, MAX_LABEL_LENGTH);
  if (!label) return err("empty_label");
  const destinationUrl = normaliseDestination(input.destination, new URL(env.APP_URL).host);
  if (!destinationUrl) return err("invalid_destination");
  if ((await links.countLinks(workspaceId)) >= MAX_LINKS_PER_WORKSPACE) return err("too_many");

  // 56^6 ≈ 3·10^10 codes: a clash is very unlikely; retry a few times on the unique index.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = codeFromBytes(randomBytes(CODE_LENGTH));
    try {
      await links.createLink({ workspaceId, code, label, destinationUrl });
      return ok({ code, url: linkUrl(code) });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Could not allocate a link code");
}

export type ClickInput = {
  code: string;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  now?: Date;
};

/** The public redirect: counts a human click and returns where to send the visitor. */
export async function resolveClick(input: ClickInput): Promise<string | null> {
  if (!isValidCode(input.code)) return null;
  const link = await links.findByCode(input.code);
  if (!link) return null;
  if (!isBot(input.userAgent)) {
    const now = input.now ?? new Date();
    await links.insertClick({
      workspaceId: link.workspaceId,
      linkId: link.id,
      clickedAt: now,
      country: input.country && /^[A-Z]{2}$/.test(input.country) ? input.country : null,
      device: deviceOf(input.userAgent ?? ""),
      visitorHash: visitorHash(input.ip, input.userAgent, now),
    });
  }
  return link.destinationUrl;
}

/** Same visitor on the same UTC day → same hash; nothing reversible is stored. */
function visitorHash(ip: string | null, userAgent: string | null, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`link-visitor|${day}|${ip ?? ""}|${userAgent ?? ""}`)
    .digest("base64url")
    .slice(0, 22);
}

export function listTrackedLinks(workspaceId: string, now: Date = new Date()) {
  return links.listLinksWithStats(
    workspaceId,
    new Date(now.getTime() - 7 * 24 * 3_600_000),
    MAX_LINKS_PER_WORKSPACE,
  );
}

export function dailyLinkClicks(workspaceId: string, since: Date, timeZone: string) {
  return links.dailyClicks(workspaceId, since, timeZone);
}

export async function archiveTrackedLink(
  workspaceId: string,
  id: string,
  now: Date = new Date(),
): Promise<Result<null, "not_found">> {
  return (await links.archiveLink(workspaceId, id, now)) ? ok(null) : err("not_found");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
