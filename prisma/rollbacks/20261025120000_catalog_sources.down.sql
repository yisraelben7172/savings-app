-- Rollback for migration 20261025120000_catalog_sources (run manually with
-- `npx prisma db execute --file prisma/rollbacks/20261025120000_catalog_sources.down.sql`,
-- then delete its row from "_prisma_migrations"). Deletes products, sources and ingestion history.
ALTER TABLE "PriceHistory" DROP CONSTRAINT IF EXISTS "PriceHistory_sourceId_fkey";
ALTER TABLE "Offer" DROP CONSTRAINT IF EXISTS "Offer_sourceId_fkey";
ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_productId_fkey";
DROP INDEX IF EXISTS "PriceHistory_sourceId_recordedAt_idx";
DROP INDEX IF EXISTS "Offer_sourceId_retailerSku_key";
DROP INDEX IF EXISTS "Offer_staleAfter_idx";
DROP INDEX IF EXISTS "Deal_productId_key";
DROP TABLE IF EXISTS "IngestionRun";
DROP TABLE IF EXISTS "Product";
DROP TABLE IF EXISTS "DataSource";
ALTER TABLE "PriceHistory" DROP COLUMN IF EXISTS "merchantId", DROP COLUMN IF EXISTS "sourceId";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "condition", DROP COLUMN IF EXISTS "currency", DROP COLUMN IF EXISTS "listPrice",
  DROP COLUMN IF EXISTS "retailerSku", DROP COLUMN IF EXISTS "sourceId", DROP COLUMN IF EXISTS "staleAfter";
ALTER TABLE "Merchant" DROP COLUMN IF EXISTS "active", DROP COLUMN IF EXISTS "affiliateStatus", DROP COLUMN IF EXISTS "complianceNotes",
  DROP COLUMN IF EXISTS "health", DROP COLUMN IF EXISTS "healthNote", DROP COLUMN IF EXISTS "integrationType",
  DROP COLUMN IF EXISTS "lastSyncAt", DROP COLUMN IF EXISTS "linkCapability", DROP COLUMN IF EXISTS "supportedCategories";
ALTER TABLE "Deal" DROP COLUMN IF EXISTS "productId";
DROP TYPE IF EXISTS "RunStatus"; DROP TYPE IF EXISTS "SourceStatus"; DROP TYPE IF EXISTS "SourceKind";
DROP TYPE IF EXISTS "HealthStatus"; DROP TYPE IF EXISTS "AffiliateStatus"; DROP TYPE IF EXISTS "IntegrationType";
