-- CreateEnum
CREATE TYPE "FeatureKind" AS ENUM ('TARGET_LOAD', 'AI_IDEAS');

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "limitAiIdeasPerTargetDay" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "limitDailyTimes" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "limitListPosts" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "limitTargetLoadsPerDay" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "limitTargets" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "targetsEnabled" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "monthlyBudgetMicros" SET DEFAULT 10000000;

-- CreateTable
CREATE TABLE "feature_usage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "FeatureKind" NOT NULL,
    "targetId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_usage_workspaceId_kind_occurredAt_idx" ON "feature_usage"("workspaceId", "kind", "occurredAt");

-- AddForeignKey
ALTER TABLE "feature_usage" ADD CONSTRAINT "feature_usage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase Data API: keep the table private.
ALTER TABLE "feature_usage" ENABLE ROW LEVEL SECURITY;
