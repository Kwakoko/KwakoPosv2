-- World-standard offline sync foundation.
-- A global monotonic revision sequence provides deterministic delta ordering.
CREATE SEQUENCE IF NOT EXISTS sync_change_revision_seq;

CREATE TABLE IF NOT EXISTS sync_change_journal (
  revision       BIGINT PRIMARY KEY DEFAULT nextval('sync_change_revision_seq'),
  tenant_id      TEXT NOT NULL,
  branch_id      TEXT NOT NULL,
  operation_id   TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  record         JSONB NOT NULL,
  source         TEXT NOT NULL DEFAULT 'push',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_id)
);

CREATE INDEX IF NOT EXISTS sync_change_journal_tenant_branch_revision_idx
  ON sync_change_journal (tenant_id, branch_id, revision);

CREATE INDEX IF NOT EXISTS sync_change_journal_entity_idx
  ON sync_change_journal (tenant_id, branch_id, entity_type, entity_id, revision);

CREATE TABLE IF NOT EXISTS sync_conflict_record (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  branch_id      TEXT NOT NULL,
  operation_id   TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  local_payload  JSONB NOT NULL,
  remote_payload JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sync_conflict_record_scope_idx
  ON sync_conflict_record (tenant_id, branch_id, status, created_at);
