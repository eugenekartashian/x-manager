-- CreateEnum
CREATE TYPE "RepostStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'SKIPPED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AttemptStep" AS ENUM ('UNDO', 'REPOST', 'RECHECK');

-- AlterTable
ALTER TABLE "repost_schedule" ADD COLUMN     "processingUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "scheduled_repost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slotId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "ownPostId" TEXT,
    "xPostId" TEXT,
    "fromList" BOOLEAN NOT NULL DEFAULT true,
    "status" "RepostStatus" NOT NULL,
    "skipReason" TEXT,
    "errorCode" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "scheduled_repost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repost_attempt" (
    "id" TEXT NOT NULL,
    "scheduledRepostId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "step" "AttemptStep" NOT NULL,
    "outcome" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repost_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_repost_dedupeKey_key" ON "scheduled_repost"("dedupeKey");

-- CreateIndex
CREATE INDEX "scheduled_repost_workspaceId_runAt_idx" ON "scheduled_repost"("workspaceId", "runAt");

-- CreateIndex
CREATE INDEX "scheduled_repost_status_leaseUntil_idx" ON "scheduled_repost"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "repost_attempt_scheduledRepostId_idx" ON "repost_attempt"("scheduledRepostId");

-- AddForeignKey
ALTER TABLE "scheduled_repost" ADD CONSTRAINT "scheduled_repost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_repost" ADD CONSTRAINT "scheduled_repost_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "repost_slot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_repost" ADD CONSTRAINT "scheduled_repost_ownPostId_fkey" FOREIGN KEY ("ownPostId") REFERENCES "own_post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repost_attempt" ADD CONSTRAINT "repost_attempt_scheduledRepostId_fkey" FOREIGN KEY ("scheduledRepostId") REFERENCES "scheduled_repost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
