-- Customers / Contacts Production Lock v1
-- Authoritative PostgreSQL contact store with strict tenant + branch ownership.
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY,
  "customerId" TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  "decisionInfluence" TEXT NOT NULL DEFAULT 'INFLUENCER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS customer_contacts_scope_idx
  ON customer_contacts ("tenantId","branchId");

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx
  ON customer_contacts ("tenantId","branchId","customerId");

CREATE INDEX IF NOT EXISTS customer_contacts_search_idx
  ON customer_contacts ("tenantId","branchId","email","phone");

CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_primary_uq
  ON customer_contacts ("tenantId","branchId","customerId")
  WHERE "isPrimary" = TRUE AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS customer_contacts_active_idx
  ON customer_contacts ("tenantId","branchId","status");

-- Explicitly reject impossible cross-tenant customer linkage at write time by using
-- application transaction checks plus tenant/branch scoped foreign-key-safe queries.

ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS "decisionInfluence" TEXT NOT NULL DEFAULT 'INFLUENCER';
