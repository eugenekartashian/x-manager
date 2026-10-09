import "server-only";
import { z } from "zod";
import type { CreatorStatus, TargetAccount } from "@/generated/prisma/client";
import { err, ok, type Result } from "@/lib/result";
import * as targets from "@/server/repositories/targets";

// Collab CRM table (M7.1, D-033): statuses, tags, filters, bulk edits. Local data only —
// nothing here calls X.

export const CREATOR_STATUSES = [
  "NEW",
  "CONTACTED",
  "REPOSTED",
  "PARTNER",
  "DECLINED",
  "NO_REPLY",
] as const satisfies readonly CreatorStatus[];

export const CREATORS_PAGE_SIZE = 50;
export const MAX_BULK = 100;
const MAX_TAG_LENGTH = 24;

const querySchema = z.object({
  status: z.enum(CREATOR_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(50).optional().catch(undefined),
  tag: z.string().trim().max(MAX_TAG_LENGTH).optional().catch(undefined),
  sort: z.enum(["followers", "recent", "contact"]).catch("followers"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type CreatorFilters = {
  status: CreatorStatus | undefined;
  q: string | undefined;
  tag: string | undefined;
  sort: targets.CreatorSort;
  page: number;
};

/** Untrusted URL search params → safe filters (bad values fall back to defaults). */
export function parseCreatorFilters(
  params: Record<string, string | string[] | undefined>,
): CreatorFilters {
  const pick = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const parsed = querySchema.parse({
    status: pick("status"),
    q: pick("q") || undefined,
    tag: pick("tag") || undefined,
    sort: pick("sort"),
    page: pick("page"),
  });
  return {
    status: parsed.status,
    q: parsed.q,
    tag: parsed.tag,
    sort: parsed.sort,
    page: parsed.page,
  };
}

export type CreatorsPage = {
  rows: TargetAccount[];
  total: number;
  pages: number;
  counts: Partial<Record<CreatorStatus, number>>;
  tags: string[];
};

export async function listCreators(
  workspaceId: string,
  filters: CreatorFilters,
): Promise<CreatorsPage> {
  const [{ rows, total }, counts, tags] = await Promise.all([
    targets.listCreatorsPage(workspaceId, {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q ? { search: filters.q } : {}),
      ...(filters.tag ? { tag: filters.tag } : {}),
      sort: filters.sort,
      page: filters.page,
      pageSize: CREATORS_PAGE_SIZE,
    }),
    targets.countCreatorsByStatus(workspaceId),
    targets.listCreatorTags(workspaceId),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / CREATORS_PAGE_SIZE)), counts, tags };
}

const idsSchema = z.array(z.uuid()).min(1).max(MAX_BULK);

export type BulkError = "invalid_selection" | "invalid_tag" | "invalid_status";

export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
  return /^[\p{L}\p{N}_-]{1,24}$/u.test(tag) ? tag : null;
}

export async function setCreatorStatus(
  workspaceId: string,
  ids: string[],
  status: string,
  now: Date = new Date(),
): Promise<Result<{ updated: number }, BulkError>> {
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedIds.success) return err("invalid_selection");
  const parsedStatus = z.enum(CREATOR_STATUSES).safeParse(status);
  if (!parsedStatus.success) return err("invalid_status");
  return ok({
    updated: await targets.setCreatorsStatus(workspaceId, parsedIds.data, parsedStatus.data, now),
  });
}

export async function tagCreators(
  workspaceId: string,
  ids: string[],
  rawTag: string,
  mode: "add" | "remove",
): Promise<Result<{ tag: string }, BulkError>> {
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedIds.success) return err("invalid_selection");
  const tag = normalizeTag(rawTag);
  if (!tag) return err("invalid_tag");
  if (mode === "add") await targets.addCreatorsTag(workspaceId, parsedIds.data, tag);
  else await targets.removeCreatorsTag(workspaceId, parsedIds.data, tag);
  return ok({ tag });
}

export async function removeCreators(
  workspaceId: string,
  ids: string[],
): Promise<Result<{ removed: number }, BulkError>> {
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedIds.success) return err("invalid_selection");
  return ok({ removed: await targets.deleteCreators(workspaceId, parsedIds.data) });
}
