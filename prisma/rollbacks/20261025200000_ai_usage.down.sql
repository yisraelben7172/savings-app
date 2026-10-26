-- Rollback for 20261025200000_ai_usage (deletes the AI usage log). Delete the "_prisma_migrations" row afterwards.
DROP TABLE IF EXISTS "AiUsage";
