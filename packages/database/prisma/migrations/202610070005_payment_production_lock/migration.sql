ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isRefund" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "refundReturnId" TEXT,
  ADD COLUMN IF NOT EXISTS "refundReason" TEXT,
  ADD COLUMN IF NOT EXISTS "refundMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "refundProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "refundProviderReference" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalOfPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reversedById" TEXT,
  ADD COLUMN IF NOT EXISTS "providerEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerVerifiedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED',
  ADD COLUMN IF NOT EXISTS "reconciliationReference" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "payments_tenant_branch_reconciliation_paid_idx"
  ON "payments" ("tenantId","branchId","reconciliationStatus","paidAt");
CREATE INDEX IF NOT EXISTS "payments_tenant_branch_sale_idx"
  ON "payments" ("tenantId","branchId","saleId");
CREATE INDEX IF NOT EXISTS "payments_tenant_branch_provider_reference_idx"
  ON "payments" ("tenantId","branchId","providerReference");
CREATE INDEX IF NOT EXISTS "payments_tenant_branch_provider_event_idx"
  ON "payments" ("tenantId","branchId","providerEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_tenant_branch_provider_event_uq"
  ON "payments" ("tenantId","branchId","providerEventId")
  WHERE "providerEventId" IS NOT NULL;