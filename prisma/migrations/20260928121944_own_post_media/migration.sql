-- AlterTable
ALTER TABLE "own_post" ADD COLUMN     "mediaCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mediaPreviewUrl" TEXT,
ADD COLUMN     "mediaType" TEXT;
