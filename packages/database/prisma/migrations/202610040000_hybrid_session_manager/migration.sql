CREATE TABLE IF NOT EXISTS "devices" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT,
  "platform" TEXT,
  "browser" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "devices_deviceId_key" ON "devices"("deviceId");
CREATE INDEX IF NOT EXISTS "devices_tenantId_userId_idx" ON "devices"("tenantId","userId");
CREATE INDEX IF NOT EXISTS "devices_deviceId_idx" ON "devices"("deviceId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_tenantId_fkey') THEN
    ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_userId_fkey') THEN
    ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "tokenFamilyId" TEXT;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "lastValidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "revokeReason" TEXT;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "permissionsVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "tenantVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "platform" TEXT;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "rememberMe" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "offlineStartedAt" TIMESTAMP(3);
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "offlineExpiresAt" TIMESTAMP(3);
ALTER TABLE "device_sessions" ADD COLUMN IF NOT EXISTS "idleTimeoutMs" INTEGER NOT NULL DEFAULT 1800000;

UPDATE "device_sessions" ds
SET "branchId" = u."branchId"
FROM "users" u
WHERE ds."userId" = u."id" AND ds."branchId" IS NULL;

UPDATE "device_sessions"
SET "branchId" = COALESCE(NULLIF("branchId", ''), 'UNKNOWN_BRANCH')
WHERE "branchId" IS NULL;

UPDATE "device_sessions"
SET "tokenFamilyId" = "id"
WHERE "tokenFamilyId" IS NULL;

UPDATE "device_sessions"
SET "refreshTokenExpiresAt" = "expiresAt"
WHERE "refreshTokenExpiresAt" IS NULL;

UPDATE "device_sessions"
SET "lastActivityAt" = COALESCE("lastActivityAt", "createdAt"),
    "lastValidatedAt" = COALESCE("lastValidatedAt", "createdAt");

UPDATE "device_sessions"
SET "status" = CASE WHEN "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP THEN 'ACTIVE' ELSE 'EXPIRED' END
WHERE "status" IS NULL OR "status" = '';

ALTER TABLE "device_sessions" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "device_sessions" ALTER COLUMN "tokenFamilyId" SET NOT NULL;
ALTER TABLE "device_sessions" ALTER COLUMN "refreshTokenExpiresAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "device_sessions_tokenFamilyId_idx" ON "device_sessions"("tokenFamilyId");
CREATE INDEX IF NOT EXISTS "device_sessions_tenantId_branchId_status_idx" ON "device_sessions"("tenantId","branchId","status");
CREATE INDEX IF NOT EXISTS "device_sessions_status_expiresAt_idx" ON "device_sessions"("status","expiresAt");
CREATE INDEX IF NOT EXISTS "device_sessions_expiresAt_idx" ON "device_sessions"("expiresAt");
CREATE INDEX IF NOT EXISTS "device_sessions_createdAt_idx" ON "device_sessions"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_sessions_deviceId_fkey') THEN
    ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
