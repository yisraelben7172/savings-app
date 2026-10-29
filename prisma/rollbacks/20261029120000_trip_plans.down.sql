-- Rollback for 20261029120000_trip_plans (deletes all trip plans and the travel columns on offers and programs).
-- Delete the "_prisma_migrations" row afterwards.
DROP TABLE IF EXISTS "TripItem";
DROP TABLE IF EXISTS "TripPlan";
DROP TYPE IF EXISTS "TripItemKind";
DROP TYPE IF EXISTS "TripStatus";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "startDate", DROP COLUMN IF EXISTS "endDate", DROP COLUMN IF EXISTS "cancellationText";
ALTER TABLE "AffiliateProgram" DROP COLUMN IF EXISTS "bookingLinkTemplate", DROP COLUMN IF EXISTS "bookingLinkDocUrl";
