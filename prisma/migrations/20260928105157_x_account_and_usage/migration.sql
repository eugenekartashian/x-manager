-- CreateEnum
CREATE TYPE "XAccountStatus" AS ENUM ('CONNECTED', 'NEEDS_RECONNECT');

-- CreateEnum
CREATE TYPE "UsageProvider" AS ENUM ('X', 'AI');

-- CreateTable
CREATE TABLE "x_account" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" "XAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_usage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "UsageProvider" NOT NULL,
    "operation" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "costMicros" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "x_account_workspaceId_key" ON "x_account"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "x_account_xUserId_key" ON "x_account"("xUserId");

-- CreateIndex
CREATE INDEX "external_usage_workspaceId_occurredAt_idx" ON "external_usage"("workspaceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "x_account" ADD CONSTRAINT "x_account_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_usage" ADD CONSTRAINT "external_usage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
