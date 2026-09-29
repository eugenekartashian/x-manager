-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "replyCooldownHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "replyDailyLimit" INTEGER NOT NULL DEFAULT 15;
