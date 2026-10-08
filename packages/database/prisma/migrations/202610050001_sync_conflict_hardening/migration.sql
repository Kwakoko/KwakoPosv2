-- Conflict resolution hardening metadata.

ALTER TABLE sync_conflict_record
  ADD COLUMN IF NOT EXISTS local_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS remote_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolution_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS resolved_server_revision BIGINT,
  ADD COLUMN IF NOT EXISTS resolved_entity_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS sync_conflict_record_resolution_operation_idx
  ON sync_conflict_record (tenant_id, branch_id, resolution_operation_id);

CREATE INDEX IF NOT EXISTS sync_conflict_record_operation_idx
  ON sync_conflict_record (tenant_id, branch_id, operation_id);
