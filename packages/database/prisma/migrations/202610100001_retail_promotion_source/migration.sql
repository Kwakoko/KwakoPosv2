ALTER TABLE "pricing_promotions"
  ADD COLUMN "sourceModule" TEXT;

CREATE INDEX "pricing_promotions_tenant_branch_source_active_idx"
  ON "pricing_promotions" ("tenantId", "branchId", "sourceModule", "isActive");
