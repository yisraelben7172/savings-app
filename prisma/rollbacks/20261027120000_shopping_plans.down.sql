-- Rollback for 20261027120000_shopping_plans (deletes all shopping plans). Delete the "_prisma_migrations" row afterwards.
DROP TABLE IF EXISTS "PlanStep";
DROP TABLE IF EXISTS "ShoppingPlan";
