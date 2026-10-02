-- Sync idempotency is a database invariant, not only an application check.
-- Existing duplicates must be investigated before applying this migration in production.
-- NOTE: sync_operations uses snake_case PostgreSQL column names.
CREATE UNIQUE INDEX IF NOT EXISTS sync_operations_tenant_device_idempotency_uq
  ON sync_operations("tenant_id", "device_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS sync_operations_tenant_branch_updated_idx
  ON sync_operations("tenant_id", "branch_id", "created_at");
