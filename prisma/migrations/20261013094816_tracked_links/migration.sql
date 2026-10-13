-- CreateTable
CREATE TABLE "tracked_link" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_click" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" TEXT,
    "device" TEXT,
    "visitorHash" TEXT NOT NULL,

    CONSTRAINT "link_click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracked_link_code_key" ON "tracked_link"("code");

-- CreateIndex
CREATE INDEX "tracked_link_workspaceId_createdAt_idx" ON "tracked_link"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "link_click_linkId_clickedAt_idx" ON "link_click"("linkId", "clickedAt");

-- CreateIndex
CREATE INDEX "link_click_workspaceId_clickedAt_idx" ON "link_click"("workspaceId", "clickedAt");

-- AddForeignKey
ALTER TABLE "tracked_link" ADD CONSTRAINT "tracked_link_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_click" ADD CONSTRAINT "link_click_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_click" ADD CONSTRAINT "link_click_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "tracked_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase: no Data API access (all access goes through the app server).
ALTER TABLE "tracked_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "link_click" ENABLE ROW LEVEL SECURITY;
