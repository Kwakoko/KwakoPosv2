-- KwakoPos v2 — Super Admin Production Lock v1
-- PostgreSQL-authoritative platform audit and replay-safe Super Admin MFA state.

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NULL REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_created_at
  ON platform_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_tenant_created
  ON platform_audit_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_actor_created
  ON platform_audit_events(actor_id, created_at DESC);

ALTER TABLE platform_super_admin_security
  ADD COLUMN IF NOT EXISTS last_totp_counter BIGINT;

CREATE INDEX IF NOT EXISTS idx_platform_super_admin_security_totp
  ON platform_super_admin_security(last_totp_counter);
