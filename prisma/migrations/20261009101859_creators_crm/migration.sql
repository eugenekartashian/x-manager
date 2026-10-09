-- CreateEnum
CREATE TYPE "CreatorStatus" AS ENUM ('NEW', 'CONTACTED', 'REPOSTED', 'PARTNER', 'DECLINED', 'NO_REPLY');

-- CreateEnum
CREATE TYPE "CreatorSource" AS ENUM ('MANUAL', 'IMPORT', 'SHARE', 'DISCOVERY');

-- AlterTable
ALTER TABLE "target_account" ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "source" "CreatorSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "CreatorStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "target_account_workspaceId_status_idx" ON "target_account"("workspaceId", "status");
