CREATE TABLE "saas_data_records" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "recordKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saas_data_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "saas_data_records_scopeKey_entityType_recordKey_key" ON "saas_data_records"("scopeKey","entityType","recordKey");
CREATE INDEX "saas_data_records_scopeKey_entityType_status_idx" ON "saas_data_records"("scopeKey","entityType","status");
