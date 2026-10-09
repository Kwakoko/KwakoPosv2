-- KwakoPos v2 — Notifications Production Lock v1
-- Durable in-app notification store with tenant-scoped read state, delivery state, retry metadata and RLS.

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "branchId" TEXT REFERENCES branches(id) ON DELETE SET NULL,
  "recipientUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'TENANT',
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  channel TEXT NOT NULL DEFAULT 'IN_APP',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  "actionPath" TEXT,
  "actionLabel" TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ,
  "queuedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sentAt" TIMESTAMPTZ,
  "deliveredAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_status_ck CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','BLOCKED')),
  CONSTRAINT notifications_scope_ck CHECK (scope IN ('TENANT','SUPER_ADMIN')),
  CONSTRAINT notifications_channel_ck CHECK (channel IN ('SMS','EMAIL','PUSH','WHATSAPP','IN_APP')),
  CONSTRAINT notifications_retry_ck CHECK ("retryCount" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_tenant_recipient_dedupe_uq
  ON notifications ("tenantId","recipientUserId","dedupeKey");
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON notifications ("tenantId","recipientUserId","readAt","createdAt" DESC);
CREATE INDEX IF NOT EXISTS notifications_scope_idx
  ON notifications ("tenantId","scope","category","createdAt" DESC);
CREATE INDEX IF NOT EXISTS notifications_retry_idx
  ON notifications ("tenantId","status","nextRetryAt");
CREATE INDEX IF NOT EXISTS notifications_branch_idx
  ON notifications ("tenantId","branchId","createdAt" DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_notifications ON notifications;
CREATE POLICY kwakopos_tenant_notifications ON notifications
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
