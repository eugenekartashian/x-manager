-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('OPENED', 'UNDONE');

-- AlterTable
ALTER TABLE "target_account" ADD COLUMN     "postsFetchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "target_post" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" TEXT,
    "mediaPreviewUrl" TEXT,
    "mediaCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER,
    "replyCount" INTEGER,
    "impressionCount" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_log" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetId" TEXT,
    "targetUsername" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ReplyStatus" NOT NULL DEFAULT 'OPENED',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "reply_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_post_workspaceId_idx" ON "target_post"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "target_post_targetId_xPostId_key" ON "target_post"("targetId", "xPostId");

-- CreateIndex
CREATE INDEX "reply_template_workspaceId_idx" ON "reply_template"("workspaceId");

-- CreateIndex
CREATE INDEX "reply_log_workspaceId_openedAt_idx" ON "reply_log"("workspaceId", "openedAt");

-- CreateIndex
CREATE INDEX "reply_log_targetId_openedAt_idx" ON "reply_log"("targetId", "openedAt");

-- AddForeignKey
ALTER TABLE "target_post" ADD CONSTRAINT "target_post_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "target_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_template" ADD CONSTRAINT "reply_template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_log" ADD CONSTRAINT "reply_log_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_log" ADD CONSTRAINT "reply_log_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "target_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep the new tables out of Supabase's Data API (see enable_rls).
ALTER TABLE "target_post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reply_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reply_log" ENABLE ROW LEVEL SECURITY;
