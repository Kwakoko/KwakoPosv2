-- Client-supplied idempotency tokens are scoped to their tenant and branch.
-- This permits independent tenants to use the same opaque token safely.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
DROP INDEX IF EXISTS "payments_idempotencyKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "payments_tenantId_branchId_idempotencyKey_key"
  ON "payments" ("tenantId", "branchId", "idempotencyKey");