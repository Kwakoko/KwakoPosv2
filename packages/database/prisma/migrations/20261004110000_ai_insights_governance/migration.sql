-- AI Insights Engine P0/P1 remediation: durable tenant-scoped state.
CREATE TABLE "ai_insights" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "observation" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "interpretation" TEXT NOT NULL,
  "impact" TEXT NOT NULL,
  "recommendedNextStep" TEXT NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "evidenceClass" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceMetricId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_recommendations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "insightId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "expectedImpact" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "policyStatus" TEXT NOT NULL,
  "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_action_ledgers" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actionExecuted" TEXT NOT NULL,
  "executedByIdentity" TEXT NOT NULL,
  "executionVerified" BOOLEAN NOT NULL,
  "verificationDetails" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_action_ledgers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ai_kill_switches" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "tenantId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "triggeredBy" TEXT NOT NULL,
  "triggeredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_kill_switches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_insights_tenantId_branchId_dedupeKey_key" ON "ai_insights"("tenantId","branchId","dedupeKey");
CREATE INDEX "ai_insights_tenantId_branchId_createdAt_idx" ON "ai_insights"("tenantId","branchId","createdAt");
CREATE INDEX "ai_recommendations_tenantId_branchId_approvalStatus_idx" ON "ai_recommendations"("tenantId","branchId","approvalStatus");
CREATE INDEX "ai_recommendations_tenantId_branchId_createdAt_idx" ON "ai_recommendations"("tenantId","branchId","createdAt");
CREATE INDEX "ai_action_ledgers_tenantId_branchId_recommendationId_timestamp_idx" ON "ai_action_ledgers"("tenantId","branchId","recommendationId","timestamp");
CREATE INDEX "ai_kill_switches_tenantId_scope_isActive_idx" ON "ai_kill_switches"("tenantId","scope","isActive");
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "ai_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_action_ledgers" ADD CONSTRAINT "ai_action_ledgers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_action_ledgers" ADD CONSTRAINT "ai_action_ledgers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_action_ledgers" ADD CONSTRAINT "ai_action_ledgers_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "ai_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_kill_switches" ADD CONSTRAINT "ai_kill_switches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_insights" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_ai_insights ON "ai_insights" USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL) WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
ALTER TABLE "ai_recommendations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_ai_recommendations ON "ai_recommendations" USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL) WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
ALTER TABLE "ai_action_ledgers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_ai_action_ledgers ON "ai_action_ledgers" USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL) WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
ALTER TABLE "ai_kill_switches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_ai_kill_switches ON "ai_kill_switches" USING ("tenantId" = kwakopos_current_tenant_id() OR "tenantId" IS NULL OR kwakopos_current_tenant_id() IS NULL) WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR "tenantId" IS NULL OR kwakopos_current_tenant_id() IS NULL);
