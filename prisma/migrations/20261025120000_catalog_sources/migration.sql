-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('NONE', 'FEED', 'RETAILER_API', 'NETWORK_API', 'MANUAL');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('NOT_APPLIED', 'APPLIED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'FAILING');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('DEMO', 'CSV_FEED', 'XML_FEED', 'RETAILER_API', 'NETWORK_API', 'MANUAL');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('AWAITING_APPROVAL', 'ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "affiliateStatus" "AffiliateStatus" NOT NULL DEFAULT 'NOT_APPLIED',
ADD COLUMN     "complianceNotes" TEXT,
ADD COLUMN     "health" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "healthNote" TEXT,
ADD COLUMN     "integrationType" "IntegrationType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "linkCapability" TEXT,
ADD COLUMN     "supportedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "condition" TEXT NOT NULL DEFAULT 'new',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "listPrice" DECIMAL(12,2),
ADD COLUMN     "retailerSku" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "staleAfter" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "merchantId" TEXT,
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "merchantId" TEXT,
    "accessMethod" TEXT,
    "agreementUrl" TEXT,
    "permissionNotes" TEXT,
    "allowedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiUseAllowed" BOOLEAN NOT NULL DEFAULT false,
    "attributionText" TEXT,
    "priceFreshnessHours" INTEGER NOT NULL DEFAULT 24,
    "retentionDays" INTEGER,
    "fullSnapshot" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "health" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "healthNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "fileHash" TEXT,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "markedOut" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "brandKey" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "mpn" TEXT,
    "mpnKey" TEXT,
    "gtin" TEXT,
    "categoryId" TEXT NOT NULL,
    "subcategory" TEXT,
    "description" TEXT,
    "attributes" JSONB,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin_key" ON "Product"("gtin");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brandKey_mpnKey_key" ON "Product"("brandKey", "mpnKey");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_productId_key" ON "Deal"("productId");

-- CreateIndex
CREATE INDEX "Offer_staleAfter_idx" ON "Offer"("staleAfter");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_sourceId_retailerSku_key" ON "Offer"("sourceId", "retailerSku");

-- CreateIndex
CREATE INDEX "PriceHistory_sourceId_recordedAt_idx" ON "PriceHistory"("sourceId", "recordedAt");

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: offers that existed before sources were tracked all came from the demo seed.
INSERT INTO "DataSource" ("id", "name", "kind", "status", "accessMethod", "permissionNotes", "aiUseAllowed", "priceFreshnessHours", "fullSnapshot", "approvedAt", "approvedBy", "updatedAt")
SELECT 'src_demo_seed', 'Demo catalog (sample data)', 'DEMO', 'ACTIVE', 'prisma/seed.ts', 'Our own made-up sample data for development. Not real store prices.', true, 24, false, CURRENT_TIMESTAMP, 'system', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Offer");

UPDATE "Offer" SET "sourceId" = 'src_demo_seed' WHERE "sourceId" IS NULL AND EXISTS (SELECT 1 FROM "DataSource" WHERE "id" = 'src_demo_seed');
UPDATE "PriceHistory" SET "sourceId" = 'src_demo_seed' WHERE "sourceId" IS NULL AND EXISTS (SELECT 1 FROM "DataSource" WHERE "id" = 'src_demo_seed');
