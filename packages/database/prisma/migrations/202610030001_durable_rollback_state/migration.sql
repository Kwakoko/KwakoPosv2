-- Durable rollback authorization state; PostgreSQL is authoritative.
CREATE TABLE IF NOT EXISTS "rollback_requests" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "requestedBy" TEXT NOT NULL,
  "requesterEmail" TEXT NOT NULL,
  "requesterRole" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approverEmail" TEXT,
  "executedBy" TEXT,
  "rollbackScope" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetVersion" TEXT NOT NULL DEFAULT 'HEAD',
  "sourceVersion" TEXT NOT NULL DEFAULT 'PREVIOUS',
  "reason" TEXT NOT NULL,
  "incidentId" TEXT,
  "businessImpact" TEXT NOT NULL DEFAULT '',
  "riskLevel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "authorizationState" TEXT NOT NULL DEFAULT 'PENDING',
  "approvalTimestamp" TIMESTAMP(3),
  "executionTimestamp" TIMESTAMP(3),
  "verificationTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "requestHash" TEXT NOT NULL,
  "executionHash" TEXT,
  "recoveryPointId" TEXT,
  "snapshotReference" TEXT,
  "syncEpochBefore" INTEGER NOT NULL DEFAULT 1000,
  "syncEpochAfter" INTEGER,
  "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
  "impactReport" JSONB,
  "isEmergency" BOOLEAN NOT NULL DEFAULT FALSE,
  "postIncidentReviewTaskId" TEXT,
  CONSTRAINT "rollback_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rollback_requests_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "rollback_requests_branch_fk" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "rollback_requests_tenant_created_idx" ON "rollback_requests"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "rollback_requests_tenant_status_idx" ON "rollback_requests"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "rollback_requests_tenant_branch_idx" ON "rollback_requests"("tenantId", "branchId");

CREATE TABLE IF NOT EXISTS "rollback_execution_locks" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "rollbackRequestId" TEXT NOT NULL,
  "rollbackScope" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "lockOwner" TEXT NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "holdingNodeId" TEXT,
  "isExpired" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "rollback_execution_locks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rollback_execution_locks_scope_key_key" UNIQUE ("scopeKey"),
  CONSTRAINT "rollback_execution_locks_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "rollback_execution_locks_branch_fk" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL,
  CONSTRAINT "rollback_execution_locks_request_fk" FOREIGN KEY ("rollbackRequestId") REFERENCES "rollback_requests"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "rollback_execution_locks_tenant_scope_idx" ON "rollback_execution_locks"("tenantId", "rollbackScope");
CREATE INDEX IF NOT EXISTS "rollback_execution_locks_expiry_idx" ON "rollback_execution_locks"("expiresAt");

CREATE TABLE IF NOT EXISTS "rollback_recovery_points" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "rollbackRequestId" TEXT NOT NULL,
  "databaseVersion" TEXT NOT NULL DEFAULT '2.13.0',
  "schemaVersion" TEXT NOT NULL DEFAULT '2.13.0',
  "applicationVersion" TEXT NOT NULL DEFAULT '2.13.0',
  "syncEpoch" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "integrityStatus" TEXT NOT NULL DEFAULT 'VALID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "rollback_recovery_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rollback_recovery_points_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "rollback_recovery_points_branch_fk" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL,
  CONSTRAINT "rollback_recovery_points_request_fk" FOREIGN KEY ("rollbackRequestId") REFERENCES "rollback_requests"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "rollback_recovery_points_tenant_created_idx" ON "rollback_recovery_points"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "rollback_recovery_points_request_idx" ON "rollback_recovery_points"("rollbackRequestId");

CREATE TABLE IF NOT EXISTS "rollback_audit_events" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "rollbackRequestId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "actorId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "previousState" TEXT,
  "newState" TEXT NOT NULL,
  "approvalReference" TEXT,
  "executionReference" TEXT,
  "result" TEXT NOT NULL,
  "errorCode" TEXT,
  "clientIp" TEXT NOT NULL DEFAULT '127.0.0.1',
  "deviceId" TEXT NOT NULL DEFAULT 'system',
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "previousHash" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  CONSTRAINT "rollback_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rollback_audit_events_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "rollback_audit_events_branch_fk" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL,
  CONSTRAINT "rollback_audit_events_request_fk" FOREIGN KEY ("rollbackRequestId") REFERENCES "rollback_requests"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "rollback_audit_events_tenant_request_time_idx" ON "rollback_audit_events"("tenantId", "rollbackRequestId", "timestamp");
CREATE INDEX IF NOT EXISTS "rollback_audit_events_tenant_time_idx" ON "rollback_audit_events"("tenantId", "timestamp");

CREATE TABLE IF NOT EXISTS "rollback_sync_states" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "syncEpoch" INTEGER NOT NULL DEFAULT 1000,
  "barrierActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "barrierEngagedAt" TIMESTAMP(3),
  "barrierReleasedAt" TIMESTAMP(3),
  CONSTRAINT "rollback_sync_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rollback_sync_states_scope_key_key" UNIQUE ("scopeKey"),
  CONSTRAINT "rollback_sync_states_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "rollback_sync_states_branch_fk" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "rollback_sync_states_tenant_branch_idx" ON "rollback_sync_states"("tenantId", "branchId");

CREATE OR REPLACE FUNCTION prevent_rollback_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ROLLBACK_AUDIT_APPEND_ONLY';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rollback_audit_events_append_only ON "rollback_audit_events";
CREATE TRIGGER rollback_audit_events_append_only
BEFORE UPDATE OR DELETE ON "rollback_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_rollback_audit_mutation();
-- Reconcile tables that may already exist from the developer Phase 2 migration.
ALTER TABLE "rollback_execution_locks" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "rollback_execution_locks" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);
ALTER TABLE "rollback_execution_locks" ADD COLUMN IF NOT EXISTS "holdingNodeId" TEXT;
ALTER TABLE "rollback_execution_locks" ADD COLUMN IF NOT EXISTS "isExpired" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "rollback_recovery_points" ADD COLUMN IF NOT EXISTS "integrityStatus" TEXT NOT NULL DEFAULT 'VALID';
ALTER TABLE "rollback_recovery_points" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "rollback_audit_events_eventHash_key" ON "rollback_audit_events"("eventHash");
CREATE UNIQUE INDEX IF NOT EXISTS "rollback_recovery_points_rollbackRequestId_key" ON "rollback_recovery_points"("rollbackRequestId");
DROP TRIGGER IF EXISTS rollback_audit_events_append_only ON "rollback_audit_events";
CREATE TRIGGER rollback_audit_events_append_only
BEFORE UPDATE OR DELETE ON "rollback_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_rollback_audit_mutation();