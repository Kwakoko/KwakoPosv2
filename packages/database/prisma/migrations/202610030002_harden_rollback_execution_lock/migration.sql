-- Align durable rollback lock storage with the repository contract.
ALTER TABLE "rollback_execution_locks"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT,
  ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "holdingNodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "isExpired" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rollback_execution_locks_branchId_fkey'
  ) THEN
    ALTER TABLE "rollback_execution_locks"
      ADD CONSTRAINT "rollback_execution_locks_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rollback_execution_locks_tenantId_branchId_idx"
  ON "rollback_execution_locks"("tenantId", "branchId");
