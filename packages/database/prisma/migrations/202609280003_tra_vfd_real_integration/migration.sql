ALTER TABLE "tra_vfd_configs"
  ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'TEST',
  ADD COLUMN "tin" TEXT,
  ADD COLUMN "certSerial" TEXT,
  ADD COLUMN "registrationId" TEXT,
  ADD COLUMN "efdSerial" TEXT,
  ADD COLUMN "receiptCode" TEXT,
  ADD COLUMN "routingKey" TEXT,
  ADD COLUMN "globalCounter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dailyCounter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "counterDate" TEXT;
ALTER TABLE "tra_vfd_fiscalizations"
  ADD COLUMN "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationError" TEXT;

CREATE INDEX "tra_vfd_fiscalizations_tenantId_branchId_reconciliationStatus_idx"
  ON "tra_vfd_fiscalizations"("tenantId","branchId","reconciliationStatus");
