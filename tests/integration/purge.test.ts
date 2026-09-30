import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { purgeStaleTargetPosts } from "@/server/jobs/purge-stale-content";
import { createOwner, resetDatabase } from "../helpers/db";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-10-10T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3_600_000);

describe("purgeStaleTargetPosts (D-030)", () => {
  it("deletes target posts older than 3 days in every workspace and keeps fresh ones", async () => {
    for (const suffix of ["a", "b"] as const) {
      const owner = await createOwner(suffix);
      const target = await prisma.targetAccount.create({
        data: {
          workspaceId: owner.workspaceId,
          xUserId: `t-${suffix}`,
          username: `t${suffix}`,
          name: "T",
          lookedUpAt: daysAgo(10),
          postsFetchedAt: suffix === "a" ? daysAgo(4) : daysAgo(1),
        },
      });
      await prisma.targetPost.create({
        data: {
          workspaceId: owner.workspaceId,
          targetId: target.id,
          xPostId: `p-${suffix}`,
          text: "x",
          postedAt: daysAgo(5),
          fetchedAt: suffix === "a" ? daysAgo(4) : daysAgo(1),
        },
      });
    }

    expect(await purgeStaleTargetPosts(NOW)).toBe(1);

    expect((await prisma.targetPost.findMany()).map((post) => post.xPostId)).toEqual(["p-b"]);
    const targets = await prisma.targetAccount.findMany({ orderBy: { username: "asc" } });
    expect(targets.map((target) => target.postsFetchedAt)).toEqual([null, daysAgo(1)]);
  });
});
