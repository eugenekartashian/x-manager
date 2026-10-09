-- CreateEnum
CREATE TYPE "CreatorRole" AS ENUM ('TOP', 'BOTTOM', 'VERSATILE');

-- AlterTable
ALTER TABLE "target_account" ADD COLUMN     "role" "CreatorRole";
