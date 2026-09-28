-- Dedicated TRA VFD persistence. This is intentionally separate from sync_operations.
CREATE TABLE "tra_vfd_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "endpoint" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tra_vfd_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tra_vfd_fiscalizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "receiptId" TEXT,
    "transactionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'LOCAL_FISCAL_PENDING',
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "fiscalReceiptNumber" TEXT,
    "fiscalCode" TEXT,
    "verificationCode" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tra_vfd_fiscalizations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "tra_vfd_outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fiscalizationId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tra_vfd_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tra_vfd_configs_tenantId_branchId_key"
ON "tra_vfd_configs"("tenantId", "branchId");
CREATE INDEX "tra_vfd_configs_tenantId_branchId_idx"
ON "tra_vfd_configs"("tenantId", "branchId");

CREATE UNIQUE INDEX "tra_vfd_fiscalizations_receiptId_key"
ON "tra_vfd_fiscalizations"("receiptId");
CREATE UNIQUE INDEX "tra_vfd_fiscalizations_tenantId_branchId_transactionId_key"
ON "tra_vfd_fiscalizations"("tenantId", "branchId", "transactionId");
CREATE INDEX "tra_vfd_fiscalizations_tenantId_branchId_state_idx"
ON "tra_vfd_fiscalizations"("tenantId", "branchId", "state");
CREATE INDEX "tra_vfd_fiscalizations_tenantId_branchId_nextAttemptAt_idx"
ON "tra_vfd_fiscalizations"("tenantId", "branchId", "nextAttemptAt");

CREATE UNIQUE INDEX "tra_vfd_outbox_tenantId_branchId_idempotencyKey_key"
ON "tra_vfd_outbox"("tenantId", "branchId", "idempotencyKey");
CREATE INDEX "tra_vfd_outbox_tenantId_branchId_status_idx"
ON "tra_vfd_outbox"("tenantId", "branchId", "status");
CREATE INDEX "tra_vfd_outbox_tenantId_branchId_nextAttemptAt_idx"
ON "tra_vfd_outbox"("tenantId", "branchId", "nextAttemptAt");

ALTER TABLE "tra_vfd_configs"
ADD CONSTRAINT "tra_vfd_configs_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tra_vfd_configs"
ADD CONSTRAINT "tra_vfd_configs_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tra_vfd_fiscalizations"
ADD CONSTRAINT "tra_vfd_fiscalizations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tra_vfd_fiscalizations"
ADD CONSTRAINT "tra_vfd_fiscalizations_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tra_vfd_fiscalizations"
ADD CONSTRAINT "tra_vfd_fiscalizations_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tra_vfd_outbox"
ADD CONSTRAINT "tra_vfd_outbox_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tra_vfd_outbox"
ADD CONSTRAINT "tra_vfd_outbox_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tra_vfd_outbox"
ADD CONSTRAINT "tra_vfd_outbox_fiscalizationId_fkey"
FOREIGN KEY ("fiscalizationId") REFERENCES "tra_vfd_fiscalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: VFD data is tenant scoped at the PostgreSQL layer.
ALTER TABLE "tra_vfd_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kwakopos_tenant_tra_vfd_configs" ON "tra_vfd_configs"
USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "tra_vfd_fiscalizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kwakopos_tenant_tra_vfd_fiscalizations" ON "tra_vfd_fiscalizations"
USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "tra_vfd_outbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kwakopos_tenant_tra_vfd_outbox" ON "tra_vfd_outbox"
USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
