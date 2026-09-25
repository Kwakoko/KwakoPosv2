-- Convergence hardening: scope idempotency keys by tenant + branch.
-- Existing unique constraints are removed before scoped constraints are installed.

DROP INDEX IF EXISTS "stock_ledgers_idempotencyKey_key";
DROP INDEX IF EXISTS "stock_adjustments_idempotencyKey_key";
DROP INDEX IF EXISTS "sync_operations_idempotencyKey_key";
DROP INDEX IF EXISTS sync_operations_tenant_device_idempotency_uq;
DROP INDEX IF EXISTS "sync_operations_tenantId_deviceId_operationId_key";
DROP INDEX IF EXISTS "sync_change_journal_operation_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS stock_ledgers_tenant_branch_idempotency_uq
  ON stock_ledgers("tenantId", "branchId", "idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS stock_adjustments_tenant_branch_idempotency_uq
  ON stock_adjustments("tenantId", "branchId", "idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_tenant_branch_idempotency_uq
  ON sync_operations("tenantId", "branchId", "idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_tenant_branch_device_operation_uq
  ON sync_operations("tenantId", "branchId", "deviceId", "operationId");

CREATE UNIQUE INDEX IF NOT EXISTS sync_change_journal_tenant_branch_operation_uq
  ON sync_change_journal(tenant_id, branch_id, operation_id);
