ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "providerEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED',
  ADD COLUMN IF NOT EXISTS "reconciliationReference" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isRefund" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "refundReturnId" TEXT,
  ADD COLUMN IF NOT EXISTS "refundReason" TEXT,
  ADD COLUMN IF NOT EXISTS "refundMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "refundProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "refundProviderReference" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalOfPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedById" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key"
  ON "payments" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "payments_tenant_branch_reconciliation_paidAt_idx"
  ON "payments" ("tenantId", "branchId", "reconciliationStatus", "paidAt");
CREATE INDEX IF NOT EXISTS "payments_tenant_branch_providerEventId_idx"
  ON "payments" ("tenantId", "branchId", "providerEventId");
