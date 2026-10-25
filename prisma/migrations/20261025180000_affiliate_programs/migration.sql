-- CreateEnum
CREATE TYPE "ClickOutcome" AS ENUM ('TRACKED', 'PLAIN', 'FALLBACK');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('NOT_APPLIED', 'APPLIED', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LinkMethod" AS ENUM ('NONE', 'AMAZON_TAG', 'DEEPLINK_TEMPLATE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REVERSED', 'PAID');

-- AlterTable
ALTER TABLE "Click" ADD COLUMN     "destinationHost" TEXT,
ADD COLUMN     "outcome" "ClickOutcome" NOT NULL DEFAULT 'PLAIN',
ADD COLUMN     "programId" TEXT,
ADD COLUMN     "recommendationId" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'NOT_APPLIED',
    "linkMethod" "LinkMethod" NOT NULL DEFAULT 'NONE',
    "accountTag" TEXT,
    "linkTemplate" TEXT,
    "allowedTrackingHosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disclosureText" TEXT,
    "commissionNotes" TEXT,
    "applicationUrl" TEXT,
    "appliedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "reportConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "clickId" TEXT,
    "subId" TEXT,
    "status" "CommissionStatus" NOT NULL,
    "saleAmount" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionImport" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProgram_merchantId_network_key" ON "AffiliateProgram"("merchantId", "network");

-- CreateIndex
CREATE INDEX "Commission_programId_status_idx" ON "Commission"("programId", "status");

-- CreateIndex
CREATE INDEX "Commission_occurredAt_idx" ON "Commission"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_programId_externalId_key" ON "Commission"("programId", "externalId");

-- CreateIndex
CREATE INDEX "CommissionImport_programId_createdAt_idx" ON "CommissionImport"("programId", "createdAt");

-- CreateIndex
CREATE INDEX "Click_createdAt_idx" ON "Click"("createdAt");

-- CreateIndex
CREATE INDEX "Click_programId_createdAt_idx" ON "Click"("programId", "createdAt");

-- AddForeignKey
ALTER TABLE "Click" ADD CONSTRAINT "Click_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateProgram" ADD CONSTRAINT "AffiliateProgram_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_clickId_fkey" FOREIGN KEY ("clickId") REFERENCES "Click"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionImport" ADD CONSTRAINT "CommissionImport_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

