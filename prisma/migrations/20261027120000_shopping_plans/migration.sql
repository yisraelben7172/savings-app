-- CreateTable
CREATE TABLE "ShoppingPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "finishedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingPlan_status_createdAt_idx" ON "ShoppingPlan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ShoppingPlan_expiresAt_idx" ON "ShoppingPlan"("expiresAt");

-- CreateIndex
CREATE INDEX "PlanStep_planId_position_idx" ON "PlanStep"("planId", "position");

-- AddForeignKey
ALTER TABLE "PlanStep" ADD CONSTRAINT "PlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ShoppingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

