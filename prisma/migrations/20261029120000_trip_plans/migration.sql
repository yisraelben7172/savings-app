-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripItemKind" AS ENUM ('HOTEL', 'FLIGHT', 'CAR');

-- AlterTable
ALTER TABLE "AffiliateProgram" ADD COLUMN     "bookingLinkDocUrl" TEXT,
ADD COLUMN     "bookingLinkTemplate" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "cancellationText" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TripPlan" (
    "id" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "destination" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "originAirport" TEXT,
    "budgetUsd" DECIMAL(12,2),
    "hotelName" TEXT,
    "wants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" "TripItemKind" NOT NULL,
    "dealSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "namedMatch" BOOLEAN NOT NULL DEFAULT false,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "offerIds" TEXT[],
    "storeOptions" JSONB NOT NULL,
    "chosenOfferId" TEXT,
    "unitPrice" DECIMAL(12,2),
    "unitLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DECIMAL(12,2),
    "cancellationText" TEXT,
    "priceCheckedAt" TIMESTAMP(3),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "selfReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripPlan_status_createdAt_idx" ON "TripPlan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TripPlan_expiresAt_idx" ON "TripPlan"("expiresAt");

-- CreateIndex
CREATE INDEX "TripItem_planId_position_idx" ON "TripItem"("planId", "position");

-- CreateIndex
CREATE INDEX "TripItem_chosenOfferId_idx" ON "TripItem"("chosenOfferId");

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TripPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_chosenOfferId_fkey" FOREIGN KEY ("chosenOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
