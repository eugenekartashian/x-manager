-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "monthlyBudgetMicros" BIGINT NOT NULL DEFAULT 5000000,
ADD COLUMN     "postsSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "own_post" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER,
    "repostCount" INTEGER,
    "replyCount" INTEGER,
    "impressionCount" INTEGER,
    "metricsUpdatedAt" TIMESTAMP(3),
    "inRotation" BOOLEAN NOT NULL DEFAULT false,
    "rotationPosition" INTEGER,
    "lastRepostedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "own_post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "own_post_workspaceId_xUserId_postedAt_idx" ON "own_post"("workspaceId", "xUserId", "postedAt");

-- CreateIndex
CREATE INDEX "own_post_workspaceId_xUserId_inRotation_rotationPosition_idx" ON "own_post"("workspaceId", "xUserId", "inRotation", "rotationPosition");

-- CreateIndex
CREATE UNIQUE INDEX "own_post_workspaceId_xPostId_key" ON "own_post"("workspaceId", "xPostId");

-- AddForeignKey
ALTER TABLE "own_post" ADD CONSTRAINT "own_post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
