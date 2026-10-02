ALTER TABLE "cash_sessions"
  ADD COLUMN "countSealedAt" TIMESTAMP(3),
  ADD COLUMN "countSealedById" TEXT,
  ADD COLUMN "countSealedDeviceId" TEXT;

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_count_sealed_by_fk"
  FOREIGN KEY ("countSealedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
