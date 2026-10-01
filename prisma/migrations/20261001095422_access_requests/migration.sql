-- CreateTable
CREATE TABLE "access_request" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "xHandle" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_request_email_key" ON "access_request"("email");

-- CreateIndex
CREATE INDEX "access_request_createdAt_idx" ON "access_request"("createdAt");

-- Supabase Data API: keep the table private.
ALTER TABLE "access_request" ENABLE ROW LEVEL SECURITY;
