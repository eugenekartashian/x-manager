-- CreateEnum
CREATE TYPE "CreatorEventKind" AS ENUM ('MESSAGE_OPENED', 'STATUS_CHANGED');

-- AlterEnum
ALTER TYPE "FeatureKind" ADD VALUE 'AI_MESSAGE';

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "limitMessagesPerDay" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "creator_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "CreatorEventKind" NOT NULL,
    "text" TEXT,
    "postUrl" TEXT,
    "status" "CreatorStatus",
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_event_workspaceId_kind_createdAt_idx" ON "creator_event"("workspaceId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "creator_event_targetId_createdAt_idx" ON "creator_event"("targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "creator_event" ADD CONSTRAINT "creator_event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_event" ADD CONSTRAINT "creator_event_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "target_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase Data API: keep the table private.
ALTER TABLE "creator_event" ENABLE ROW LEVEL SECURITY;
