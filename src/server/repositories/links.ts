import "server-only";
import type { TrackedLink } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Tracked links (D-039). Every owner query is scoped by workspaceId; the public redirect
// looks a link up by its unguessable code only.

export function countLinks(workspaceId: string): Promise<number> {
  return prisma.trackedLink.count({ where: { workspaceId, archivedAt: null } });
}

export function createLink(input: {
  workspaceId: string;
  code: string;
  label: string;
  destinationUrl: string;
}): Promise<TrackedLink> {
  return prisma.trackedLink.create({ data: input });
}

/** Archived links keep redirecting: they may still sit in old posts and bios. */
export function findByCode(code: string) {
  return prisma.trackedLink.findUnique({
    where: { code },
    select: { id: true, workspaceId: true, destinationUrl: true },
  });
}

export async function insertClick(input: {
  workspaceId: string;
  linkId: string;
  clickedAt: Date;
  country: string | null;
  device: string;
  visitorHash: string;
}): Promise<void> {
  await prisma.linkClick.create({ data: input });
}

export type LinkStats = TrackedLink & { total: number; last7d: number; unique7d: number };

export async function listLinksWithStats(
  workspaceId: string,
  since7d: Date,
  limit: number,
): Promise<LinkStats[]> {
  const links = await prisma.trackedLink.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (links.length === 0) return [];
  const ids = links.map((link) => link.id);
  const [totals, recent, unique] = await Promise.all([
    prisma.linkClick.groupBy({
      by: ["linkId"],
      where: { workspaceId, linkId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.linkClick.groupBy({
      by: ["linkId"],
      where: { workspaceId, linkId: { in: ids }, clickedAt: { gte: since7d } },
      _count: { _all: true },
    }),
    prisma.linkClick.groupBy({
      by: ["linkId", "visitorHash"],
      where: { workspaceId, linkId: { in: ids }, clickedAt: { gte: since7d } },
    }),
  ]);
  const count = (rows: { linkId: string; _count: { _all: number } }[], id: string) =>
    rows.find((row) => row.linkId === id)?._count._all ?? 0;
  return links.map((link) => ({
    ...link,
    total: count(totals, link.id),
    last7d: count(recent, link.id),
    unique7d: unique.filter((row) => row.linkId === link.id).length,
  }));
}

export type DayCount = { day: string; count: number };

/** Human clicks per local day for the whole workspace (or one link). */
export function dailyClicks(
  workspaceId: string,
  since: Date,
  timeZone: string,
): Promise<DayCount[]> {
  return prisma.$queryRaw`
    SELECT to_char(("clickedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           count(*)::int AS count
    FROM link_click
    WHERE "workspaceId" = ${workspaceId} AND "clickedAt" >= ${since}
    GROUP BY 1`;
}

export async function archiveLink(workspaceId: string, id: string, now: Date): Promise<boolean> {
  const { count } = await prisma.trackedLink.updateMany({
    where: { id, workspaceId, archivedAt: null },
    data: { archivedAt: now },
  });
  return count > 0;
}
