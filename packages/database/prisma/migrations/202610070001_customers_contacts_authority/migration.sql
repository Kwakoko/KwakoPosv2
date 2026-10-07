ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "customer_contacts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "contactCode" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL DEFAULT '',
  "roleTitle" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_code_key"
  ON "customer_contacts"("tenantId","branchId","contactCode");

CREATE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_customer_idx"
  ON "customer_contacts"("tenantId","branchId","customerId");

CREATE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_phone_idx"
  ON "customer_contacts"("tenantId","branchId","phone");

CREATE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_email_idx"
  ON "customer_contacts"("tenantId","branchId","email");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_tenant_id_fkey'
  ) THEN
    ALTER TABLE "customer_contacts"
      ADD CONSTRAINT "customer_contacts_tenant_id_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_branch_id_fkey'
  ) THEN
    ALTER TABLE "customer_contacts"
      ADD CONSTRAINT "customer_contacts_branch_id_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_customer_id_fkey'
  ) THEN
    ALTER TABLE "customer_contacts"
      ADD CONSTRAINT "customer_contacts_customer_id_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
