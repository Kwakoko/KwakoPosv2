-- Durable domain-event journal for production application communication.
-- Domain events are persisted independently from the process-local event bus so
-- Cloud Run instance replacement cannot erase pending module notifications.

CREATE TABLE IF NOT EXISTS domain_event_journal (
  event_id        TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  branch_id       TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  engine_id       TEXT NOT NULL,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  actor_id        TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  correlation_id  TEXT,
  causation_id    TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  source          TEXT NOT NULL DEFAULT 'production',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_event_journal_scope_event_uq
  ON domain_event_journal (tenant_id, branch_id, event_id);

CREATE INDEX IF NOT EXISTS domain_event_journal_scope_created_idx
  ON domain_event_journal (tenant_id, branch_id, created_at);

CREATE INDEX IF NOT EXISTS domain_event_journal_pending_idx
  ON domain_event_journal (tenant_id, branch_id, published_at, created_at);
