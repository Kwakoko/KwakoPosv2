-- Category/Brand master data hardening. Safe for the partially-created table left by the failed first attempt.
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "brands" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "origin" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "brands_tenantId_branchId_code_key" ON "brands" ("tenantId", "branchId", "code");
CREATE INDEX IF NOT EXISTS "brands_tenantId_branchId_idx" ON "brands" ("tenantId", "branchId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_tenantId_fkey') THEN
    ALTER TABLE "brands" ADD CONSTRAINT "brands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_branchId_fkey') THEN
    ALTER TABLE "brands" ADD CONSTRAINT "brands_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_brand_id_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
