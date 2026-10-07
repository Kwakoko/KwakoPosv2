ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "wallet_balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "customer_contacts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "contact_code" TEXT NOT NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL DEFAULT '',
  "role_title" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_code_key"
  ON "customer_contacts"("tenant_id","branch_id","contact_code");

CREATE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_customer_idx"
  ON "customer_contacts"("tenant_id","branch_id","customer_id");

CREATE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_phone_idx"
  ON "customer_contacts"("tenant_id","branch_id","phone");

CREATE INDEX IF NOT EXISTS "customer_contacts_tenant_branch_email_idx"
  ON "customer_contacts"("tenant_id","branch_id","email");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_tenant_id_fkey'
  ) THEN
    ALTER TABLE "customer_contacts"
      ADD CONSTRAINT "customer_contacts_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_branch_id_fkey'
  ) THEN
    ALTER TABLE "customer_contacts"
      ADD CONSTRAINT "customer_contacts_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_customer_id_fkey'
  ) THEN
    ALTER TABLE "customer_contacts"
      ADD CONSTRAINT "customer_contacts_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
