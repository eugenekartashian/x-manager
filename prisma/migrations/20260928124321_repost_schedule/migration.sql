-- CreateEnum
CREATE TYPE "SlotTarget" AS ENUM ('PINNED', 'POST', 'NEXT_FROM_LIST');

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "dailyRepostCap" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "perPostMinIntervalMinutes" INTEGER NOT NULL DEFAULT 240;

-- CreateTable
CREATE TABLE "repost_schedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT NOT NULL,
    "durationDays" INTEGER,
    "listCursorPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repost_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repost_slot" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "localTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "target" "SlotTarget" NOT NULL,
    "ownPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repost_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repost_schedule_workspaceId_key" ON "repost_schedule"("workspaceId");

-- CreateIndex
CREATE INDEX "repost_slot_workspaceId_idx" ON "repost_slot"("workspaceId");

-- CreateIndex
CREATE INDEX "repost_slot_scheduleId_idx" ON "repost_slot"("scheduleId");

-- AddForeignKey
ALTER TABLE "repost_schedule" ADD CONSTRAINT "repost_schedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repost_slot" ADD CONSTRAINT "repost_slot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "repost_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repost_slot" ADD CONSTRAINT "repost_slot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repost_slot" ADD CONSTRAINT "repost_slot_ownPostId_fkey" FOREIGN KEY ("ownPostId") REFERENCES "own_post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
