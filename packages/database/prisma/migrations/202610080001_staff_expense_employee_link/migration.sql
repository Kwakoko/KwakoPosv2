-- Staff expense ownership: associate each Expense with an Employee when applicable.
ALTER TABLE "expenses" ADD COLUMN "employeeId" TEXT;

CREATE INDEX "expenses_tenantId_branchId_employeeId_incurredAt_idx"
  ON "expenses"("tenantId","branchId","employeeId","incurredAt");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
