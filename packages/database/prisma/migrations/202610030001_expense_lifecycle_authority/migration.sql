-- Authoritative Expense lifecycle hardening.
-- Existing Expense rows were historically treated as paid cash expenses; preserve that accounting meaning
-- while adding the fields required by the canonical UI/API/sync lifecycle.

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "description" TEXT;
UPDATE "expenses" SET "description" = NULLIF("reason", '') WHERE "description" IS NULL;
UPDATE "expenses" SET "description" = 'Expense' WHERE "description" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "description" SET DEFAULT '';

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payee" TEXT;
UPDATE "expenses" SET "payee" = 'Unspecified Payee' WHERE "payee" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "payee" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "payee" SET DEFAULT '';

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
UPDATE "expenses" SET "paymentMethod" = 'CASH' WHERE "paymentMethod" IS NULL OR "paymentMethod" = '';
ALTER TABLE "expenses" ALTER COLUMN "paymentMethod" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "status" TEXT;
UPDATE "expenses" SET "status" = 'PAID' WHERE "status" IS NULL OR "status" = '';
ALTER TABLE "expenses" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "status" SET DEFAULT 'PAID';

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "taxDeductible" BOOLEAN;
UPDATE "expenses" SET "taxDeductible" = FALSE WHERE "taxDeductible" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "taxDeductible" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "taxDeductible" SET DEFAULT FALSE;

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paidById" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "voidedById" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
UPDATE "expenses" SET "idempotencyKey" = "id" WHERE "idempotencyKey" IS NULL OR "idempotencyKey" = '';
ALTER TABLE "expenses" ALTER COLUMN "idempotencyKey" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "idempotencyKey" DROP DEFAULT;

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "expenses" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "expenses_tenantId_branchId_idempotencyKey_key"
  ON "expenses" ("tenantId", "branchId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "expenses_tenantId_branchId_status_incurredAt_idx"
  ON "expenses" ("tenantId", "branchId", "status", "incurredAt");