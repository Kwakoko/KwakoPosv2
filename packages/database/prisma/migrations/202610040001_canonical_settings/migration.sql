CREATE TABLE "settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "userId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'TENANT',
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "settings_tenantId_branchId_scope_key_isActive_idx"
  ON "settings" ("tenantId", "branchId", "scope", "key", "isActive");

CREATE INDEX "settings_tenantId_userId_scope_key_isActive_idx"
  ON "settings" ("tenantId", "userId", "scope", "key", "isActive");

CREATE INDEX "settings_tenantId_key_updatedAt_idx"
  ON "settings" ("tenantId", "key", "updatedAt");
