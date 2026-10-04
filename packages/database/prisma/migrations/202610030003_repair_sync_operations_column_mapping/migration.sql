-- Repair drift between the canonical snake_case sync_operations table contract and
-- legacy databases that were created with Prisma's default camelCase column names.
-- This migration is idempotent and preserves existing data/constraints.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sync_operations') THEN
    CREATE TABLE "sync_operations" (
      "id" TEXT PRIMARY KEY,
      "tenant_id" TEXT NOT NULL,
      "branch_id" TEXT NOT NULL,
      "device_id" TEXT NOT NULL,
      "operation_id" TEXT NOT NULL,
      "entity_type" TEXT NOT NULL,
      "entity_id" TEXT NOT NULL,
      "operation_type" TEXT NOT NULL,
      "payload" JSONB NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PROCESSED',
      "idempotency_key" TEXT NOT NULL,
      "client_created_at" TIMESTAMPTZ NOT NULL,
      "processed_at" TIMESTAMPTZ,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT old_name, new_name
    FROM (VALUES
      ('tenantId','tenant_id'),
      ('branchId','branch_id'),
      ('deviceId','device_id'),
      ('operationId','operation_id'),
      ('entityType','entity_type'),
      ('entityId','entity_id'),
      ('operationType','operation_type'),
      ('idempotencyKey','idempotency_key'),
      ('clientCreatedAt','client_created_at'),
      ('processedAt','processed_at'),
      ('createdAt','created_at')
    ) AS mapping(old_name,new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='sync_operations' AND column_name=r.old_name
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='sync_operations' AND column_name=r.new_name
    ) THEN
      EXECUTE format('ALTER TABLE "sync_operations" RENAME COLUMN %I TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;

ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "device_id" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "operation_id" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "entity_type" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "entity_id" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "operation_type" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PROCESSED';
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "client_created_at" TIMESTAMPTZ;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMPTZ;
ALTER TABLE "sync_operations" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ DEFAULT NOW();

-- Backfill only columns that were added to an unexpectedly incomplete table.
UPDATE "sync_operations" SET "status" = COALESCE("status", 'PROCESSED');
UPDATE "sync_operations" SET "created_at" = COALESCE("created_at", NOW());
UPDATE "sync_operations" SET "client_created_at" = COALESCE("client_created_at", "created_at", NOW());

ALTER TABLE "sync_operations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "device_id" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "operation_id" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "entity_type" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "entity_id" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "operation_type" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "payload" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "idempotency_key" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "client_created_at" SET NOT NULL;
ALTER TABLE "sync_operations" ALTER COLUMN "created_at" SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS "sync_operations_tenant_branch_device_operation_uq"
  ON "sync_operations" ("tenant_id", "branch_id", "device_id", "operation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sync_operations_tenant_branch_idempotency_uq"
  ON "sync_operations" ("tenant_id", "branch_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "sync_operations_tenant_branch_created_idx"
  ON "sync_operations" ("tenant_id", "branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "sync_operations_tenant_status_created_idx"
  ON "sync_operations" ("tenant_id", "status", "created_at");

-- Ensure the canonical tenant/branch relations exist when repairing a legacy table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_tenant_id_fkey') THEN
    ALTER TABLE "sync_operations"
      ADD CONSTRAINT "sync_operations_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_branch_id_fkey') THEN
    ALTER TABLE "sync_operations"
      ADD CONSTRAINT "sync_operations_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE;
  END IF;
END $$;
