-- CreateTable
CREATE TABLE "target_account" (
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
    "note" TEXT,
    "lastRepliedAt" TIMESTAMP(3),
    "lookedUpAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_account_workspaceId_followersCount_idx" ON "target_account"("workspaceId", "followersCount");

-- CreateIndex
CREATE UNIQUE INDEX "target_account_workspaceId_xUserId_key" ON "target_account"("workspaceId", "xUserId");

-- AddForeignKey
ALTER TABLE "target_account" ADD CONSTRAINT "target_account_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the new table out of Supabase's Data API (see enable_rls).
ALTER TABLE "target_account" ENABLE ROW LEVEL SECURITY;
