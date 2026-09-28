-- AlterTable
ALTER TABLE "external_usage" ADD COLUMN     "billedUnits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "billed_resource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billed_resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billed_resource_workspaceId_day_kind_resourceId_key" ON "billed_resource"("workspaceId", "day", "kind", "resourceId");

-- AddForeignKey
ALTER TABLE "billed_resource" ADD CONSTRAINT "billed_resource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing rows: before deduplication was modelled, every unit was counted as billed.
UPDATE "external_usage" SET "billedUnits" = "units";

-- Keep the new table out of Supabase's Data API (see enable_rls).
ALTER TABLE "billed_resource" ENABLE ROW LEVEL SECURITY;
