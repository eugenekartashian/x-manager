-- AlterTable
ALTER TABLE "target_account" ADD COLUMN     "followsYou" BOOLEAN,
ADD COLUMN     "youFollow" BOOLEAN;

-- CreateIndex
CREATE INDEX "target_account_workspaceId_followsYou_idx" ON "target_account"("workspaceId", "followsYou");
