-- Dashboard production read model and payable reporting index
CREATE TABLE "dashboard_read_models" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "asOfRevision" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dashboard_read_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_read_models_tenantId_branchId_timeframe_key"
ON "dashboard_read_models"("tenantId", "branchId", "timeframe");

CREATE INDEX "dashboard_read_models_tenantId_branchId_asOfRevision_idx"
ON "dashboard_read_models"("tenantId", "branchId", "asOfRevision");

CREATE INDEX "supplier_invoices_tenantId_branchId_status_dueDate_idx"
ON "supplier_invoices"("tenantId", "branchId", "status", "dueDate");
