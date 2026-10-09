-- AlterEnum
ALTER TYPE "FeatureKind" ADD VALUE 'REPOST_CHECK';

-- AlterTable
ALTER TABLE "target_account" ADD COLUMN     "repostedBackAt" TIMESTAMP(3),
ADD COLUMN     "theyRepostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "promoted_post_check" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "seenIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promoted_post_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promoted_post_check_workspaceId_xPostId_key" ON "promoted_post_check"("workspaceId", "xPostId");

-- AddForeignKey
ALTER TABLE "promoted_post_check" ADD CONSTRAINT "promoted_post_check_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase Data API: keep the table private.
ALTER TABLE "promoted_post_check" ENABLE ROW LEVEL SECURITY;
