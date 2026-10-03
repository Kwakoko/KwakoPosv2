-- Durable rollback authorization state and materialized per-variant balances.
-- Existing tenant/branch/product IDs are TEXT in the live PostgreSQL schema; keep
-- new foreign keys type-compatible with those authoritative columns.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "rollback_requests" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestHash" TEXT NOT NULL,
    "executionHash" TEXT,
    "recoveryPointId" TEXT,
    "snapshotReference" TEXT,
    "syncEpochBefore" INTEGER NOT NULL DEFAULT 1000,
    "syncEpochAfter" INTEGER,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "impactReport" JSONB,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "postIncidentReviewTaskId" TEXT,
    CONSTRAINT "rollback_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rollback_recovery_points" (
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
    CONSTRAINT "rollback_recovery_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rollback_execution_locks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rollbackScope" TEXT NOT NULL,
    "lockOwner" TEXT NOT NULL,
    "rollbackRequestId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rollback_execution_locks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rollback_audit_events" (
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
    "timestamp" TIMESTAMP(3) NOT NULL,
    "previousHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    CONSTRAINT "rollback_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "rollback_sync_states" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "syncEpoch" INTEGER NOT NULL DEFAULT 1000,
    "barrierActive" BOOLEAN NOT NULL DEFAULT false,
    "barrierEngagedAt" TIMESTAMP(3),
    "barrierReleasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rollback_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_variant_balances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "currentQuantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "stockValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_variant_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rollback_recovery_points_rollbackRequestId_key"
    ON "rollback_recovery_points"("rollbackRequestId");
CREATE UNIQUE INDEX "rollback_execution_locks_scopeKey_key"
    ON "rollback_execution_locks"("scopeKey");
CREATE UNIQUE INDEX "rollback_audit_events_eventHash_key"
    ON "rollback_audit_events"("eventHash");
CREATE UNIQUE INDEX "rollback_sync_states_scopeKey_key"
    ON "rollback_sync_states"("scopeKey");
CREATE UNIQUE INDEX "product_variant_balances_tenantId_branchId_variantId_key"
    ON "product_variant_balances"("tenantId","branchId","variantId");
CREATE INDEX "rollback_requests_tenantId_status_createdAt_idx"
    ON "rollback_requests"("tenantId","status","createdAt");
CREATE INDEX "rollback_requests_tenantId_branchId_status_idx"
    ON "rollback_requests"("tenantId","branchId","status");
CREATE INDEX "rollback_requests_tenantId_expiresAt_idx"
    ON "rollback_requests"("tenantId","expiresAt");
CREATE INDEX "rollback_recovery_points_tenantId_branchId_createdAt_idx"
    ON "rollback_recovery_points"("tenantId","branchId","createdAt");
CREATE INDEX "rollback_execution_locks_tenantId_rollbackScope_expiresAt_idx"
    ON "rollback_execution_locks"("tenantId","rollbackScope","expiresAt");
CREATE INDEX "rollback_audit_events_tenantId_rollbackRequestId_timestamp_idx"
    ON "rollback_audit_events"("tenantId","rollbackRequestId","timestamp");
CREATE INDEX "rollback_audit_events_tenantId_branchId_timestamp_idx"
    ON "rollback_audit_events"("tenantId","branchId","timestamp");
CREATE INDEX "rollback_sync_states_tenantId_branchId_idx"
    ON "rollback_sync_states"("tenantId","branchId");
CREATE INDEX "product_variant_balances_tenantId_branchId_productId_idx"
    ON "product_variant_balances"("tenantId","branchId","productId");
ALTER TABLE "rollback_requests"
    ADD CONSTRAINT "rollback_requests_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_requests"
    ADD CONSTRAINT "rollback_requests_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_recovery_points"
    ADD CONSTRAINT "rollback_recovery_points_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_recovery_points"
    ADD CONSTRAINT "rollback_recovery_points_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_recovery_points"
    ADD CONSTRAINT "rollback_recovery_points_rollbackRequestId_fkey"
    FOREIGN KEY ("rollbackRequestId") REFERENCES "rollback_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_execution_locks"
    ADD CONSTRAINT "rollback_execution_locks_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_execution_locks"
    ADD CONSTRAINT "rollback_execution_locks_rollbackRequestId_fkey"
    FOREIGN KEY ("rollbackRequestId") REFERENCES "rollback_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_audit_events"
    ADD CONSTRAINT "rollback_audit_events_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_audit_events"
    ADD CONSTRAINT "rollback_audit_events_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_audit_events"
    ADD CONSTRAINT "rollback_audit_events_rollbackRequestId_fkey"
    FOREIGN KEY ("rollbackRequestId") REFERENCES "rollback_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_sync_states"
    ADD CONSTRAINT "rollback_sync_states_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rollback_sync_states"
    ADD CONSTRAINT "rollback_sync_states_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_balances"
    ADD CONSTRAINT "product_variant_balances_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_balances"
    ADD CONSTRAINT "product_variant_balances_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_balances"
    ADD CONSTRAINT "product_variant_balances_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_balances"
    ADD CONSTRAINT "product_variant_balances_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the materialized balance from the authoritative immutable ledger.
INSERT INTO "product_variant_balances" (
    "id", "tenantId", "branchId", "productId", "variantId",
    "currentQuantity", "averageCost", "stockValue", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    sl."tenantId",
    sl."branchId",
    sl."productId",
    sl."variantId",
    COALESCE(SUM(sl."quantityChange"), 0)::numeric(15,4),
    COALESCE(
      SUM(CASE WHEN sl."quantityChange" > 0 THEN sl."quantityChange" * sl."unitCost" ELSE 0 END)
      / NULLIF(SUM(CASE WHEN sl."quantityChange" > 0 THEN sl."quantityChange" ELSE 0 END), 0),
      0
    )::numeric(15,2),
    (
      COALESCE(SUM(sl."quantityChange"), 0)
      * COALESCE(
          SUM(CASE WHEN sl."quantityChange" > 0 THEN sl."quantityChange" * sl."unitCost" ELSE 0 END)
          / NULLIF(SUM(CASE WHEN sl."quantityChange" > 0 THEN sl."quantityChange" ELSE 0 END), 0),
          0
        )
    )::numeric(15,2),
    CURRENT_TIMESTAMP
FROM "stock_ledgers" sl
GROUP BY sl."tenantId", sl."branchId", sl."productId", sl."variantId"
ON CONFLICT ("tenantId", "branchId", "variantId") DO UPDATE SET
    "productId" = EXCLUDED."productId",
    "currentQuantity" = EXCLUDED."currentQuantity",
    "averageCost" = EXCLUDED."averageCost",
    "stockValue" = EXCLUDED."stockValue",
    "updatedAt" = CURRENT_TIMESTAMP;
