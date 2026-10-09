-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'ADDED', 'SKIPPED');

-- AlterTable
ALTER TABLE "target_account" ADD COLUMN     "followingCursor" TEXT,
ADD COLUMN     "followingExhausted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "creator_candidate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "followersCount" INTEGER,
    "followingCount" INTEGER,
    "postsCount" INTEGER,
    "followsYou" BOOLEAN,
    "youFollow" BOOLEAN,
    "via" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_candidate_workspaceId_status_followersCount_idx" ON "creator_candidate"("workspaceId", "status", "followersCount");

-- CreateIndex
CREATE UNIQUE INDEX "creator_candidate_workspaceId_xUserId_key" ON "creator_candidate"("workspaceId", "xUserId");

-- AddForeignKey
ALTER TABLE "creator_candidate" ADD CONSTRAINT "creator_candidate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase: no Data API access (all access goes through the app server).
ALTER TABLE "creator_candidate" ENABLE ROW LEVEL SECURITY;
