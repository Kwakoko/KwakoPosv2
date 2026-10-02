ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drawerOperationId" TEXT;
CREATE TABLE IF NOT EXISTS "drawer_operations" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL,
  "cashSessionId" TEXT, "paymentId" TEXT, "saleId" TEXT, "operationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "lastError" TEXT, "deviceId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drawer_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payments_drawerOperationId_key" ON "payments"("drawerOperationId");
CREATE UNIQUE INDEX IF NOT EXISTS "drawer_operations_paymentId_key" ON "drawer_operations"("paymentId");
CREATE INDEX IF NOT EXISTS "drawer_operations_scope_status_idx" ON "drawer_operations"("tenantId","branchId","status","requestedAt");
CREATE INDEX IF NOT EXISTS "drawer_operations_scope_type_idx" ON "drawer_operations"("tenantId","branchId","operationType","createdAt");
DO $$ BEGIN ALTER TABLE "drawer_operations" ADD CONSTRAINT "drawer_operations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drawer_operations" ADD CONSTRAINT "drawer_operations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "drawer_operations" ADD CONSTRAINT "drawer_operations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_drawerOperationId_fkey" FOREIGN KEY ("drawerOperationId") REFERENCES "drawer_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
