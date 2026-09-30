-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "access_invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "access_invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_invite_email_key" ON "access_invite"("email");

-- CreateIndex
CREATE INDEX "access_invite_invitedById_idx" ON "access_invite"("invitedById");

-- AddForeignKey
ALTER TABLE "access_invite" ADD CONSTRAINT "access_invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supabase Data API: keep the table private (no policies = no access via PostgREST).
ALTER TABLE "access_invite" ENABLE ROW LEVEL SECURITY;

-- Everyone who already has an account was on the env allowlist: keep their access.
INSERT INTO "access_invite" ("id", "email")
SELECT gen_random_uuid()::text, lower(trim("email")) FROM "user"
ON CONFLICT ("email") DO NOTHING;
