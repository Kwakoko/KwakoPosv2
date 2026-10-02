ALTER TABLE sync_conflict_record
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'UPDATE';

CREATE INDEX IF NOT EXISTS sync_conflict_record_scope_status_idx
  ON sync_conflict_record (tenant_id, branch_id, status, created_at);