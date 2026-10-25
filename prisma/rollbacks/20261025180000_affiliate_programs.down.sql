-- Rollback for 20261025180000_affiliate_programs (run manually; deletes affiliate programs, commissions and click details).
-- npx prisma db execute --file prisma/rollbacks/20261025180000_affiliate_programs.down.sql --schema prisma/schema.prisma
-- then delete its row from "_prisma_migrations".
ALTER TABLE "Click" DROP CONSTRAINT IF EXISTS "Click_programId_fkey";
DROP TABLE IF EXISTS "Commission";
DROP TABLE IF EXISTS "CommissionImport";
DROP TABLE IF EXISTS "AffiliateProgram";
DROP INDEX IF EXISTS "Click_createdAt_idx";
DROP INDEX IF EXISTS "Click_programId_createdAt_idx";
ALTER TABLE "Click" DROP COLUMN IF EXISTS "destinationHost", DROP COLUMN IF EXISTS "outcome", DROP COLUMN IF EXISTS "programId",
  DROP COLUMN IF EXISTS "recommendationId", DROP COLUMN IF EXISTS "sessionId";
DROP TYPE IF EXISTS "CommissionStatus"; DROP TYPE IF EXISTS "LinkMethod"; DROP TYPE IF EXISTS "ProgramStatus"; DROP TYPE IF EXISTS "ClickOutcome";
