-- Restore the canonical Sale -> Employee relation in PostgreSQL.
-- The Prisma schema already declares sales.employeeId; this migration closes
-- the physical schema gap required by authoritative sync/bootstrap reads.
ALTER TABLE "sales" ADD COLUMN "employeeId" TEXT;

CREATE INDEX "sales_tenantId_branchId_employeeId_idx"
  ON "sales"("tenantId","branchId","employeeId");

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
