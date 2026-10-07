-- Cash Management Production Lock v1: persist register identity without rewriting legacy sessions.
ALTER TABLE "cash_sessions"
  ADD COLUMN IF NOT EXISTS "registerCode" TEXT;

CREATE INDEX IF NOT EXISTS "cash_sessions_tenant_branch_registerCode_idx"
  ON "cash_sessions"("tenantId","branchId","registerCode");

CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_active_register_unique"
  ON "cash_sessions"("tenantId","branchId","registerCode")
  WHERE "registerCode" IS NOT NULL
    AND "status" IN ('OPEN','ACTIVE','CLOSE_REQUESTED');
