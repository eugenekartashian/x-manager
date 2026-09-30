import "server-only";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db";

// X Developer Policy (content compliance): stored X content must stay current and content
// deleted on X must go. Target posts are only useful while fresh, so we drop them after a few
// days instead of keeping copies (D-030). Maintenance across all workspaces; no user input.

export const TARGET_POST_RETENTION_MS = 3 * 24 * 3_600_000;

export async function purgeStaleTargetPosts(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - TARGET_POST_RETENTION_MS);
  const [deleted] = await prisma.$transaction([
    prisma.targetPost.deleteMany({ where: { fetchedAt: { lt: cutoff } } }),
    // Their "loaded" marker goes too, so the page offers a fresh load instead of "no posts".
    prisma.targetAccount.updateMany({
      where: { postsFetchedAt: { lt: cutoff } },
      data: { postsFetchedAt: null },
    }),
  ]);
  if (deleted.count > 0) logger.info("jobs.target_posts_purged", { count: deleted.count });
  return deleted.count;
}
