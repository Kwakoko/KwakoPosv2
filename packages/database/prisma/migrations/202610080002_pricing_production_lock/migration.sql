-- Pricing / Promotions Production Lock: persistent authoritative pricing controls.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "customerSegment" TEXT;

CREATE TABLE IF NOT EXISTS price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  "priceListId" UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  "productId" UUID REFERENCES products(id) ON DELETE CASCADE,
  "variantId" UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  "unitPrice" DECIMAL(15,2) NOT NULL CHECK ("unitPrice" >= 0),
  currency TEXT NOT NULL DEFAULT 'TZS',
  priority INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "effectiveFrom" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE INDEX IF NOT EXISTS price_list_items_scope_idx
  ON price_list_items ("tenantId","branchId","priceListId","variantId","isActive","effectiveFrom");
CREATE INDEX IF NOT EXISTS price_list_items_variant_idx
  ON price_list_items ("tenantId","branchId","variantId","isActive","effectiveFrom");

CREATE TABLE IF NOT EXISTS customer_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  "customerId" UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "variantId" UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  "unitPrice" DECIMAL(15,2) NOT NULL CHECK ("unitPrice" >= 0),
  currency TEXT NOT NULL DEFAULT 'TZS',
  priority INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "effectiveFrom" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE INDEX IF NOT EXISTS customer_prices_scope_idx
  ON customer_prices ("tenantId","branchId","customerId","variantId","isActive","effectiveFrom");

CREATE TABLE IF NOT EXISTS pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  "variantId" UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('BULK','WHOLESALE')),
  "customerSegment" TEXT,
  "minQuantity" DECIMAL(12,4) NOT NULL CHECK ("minQuantity" > 0),
  "maxQuantity" DECIMAL(12,4),
  "unitPrice" DECIMAL(15,2) NOT NULL CHECK ("unitPrice" >= 0),
  currency TEXT NOT NULL DEFAULT 'TZS',
  priority INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "effectiveFrom" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("maxQuantity" IS NULL OR "maxQuantity" >= "minQuantity"),
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE INDEX IF NOT EXISTS pricing_tiers_scope_idx
  ON pricing_tiers ("tenantId","branchId","variantId",kind,"isActive","effectiveFrom");
CREATE INDEX IF NOT EXISTS pricing_tiers_segment_idx
  ON pricing_tiers ("tenantId","branchId",kind,"customerSegment","isActive","effectiveFrom");

CREATE TABLE IF NOT EXISTS pricing_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "branchId" UUID REFERENCES branches(id) ON DELETE CASCADE,
  "variantId" UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PERCENTAGE','FIXED')),
  value DECIMAL(15,2) NOT NULL CHECK ("value" >= 0 AND (kind <> 'PERCENTAGE' OR "value" <= 100)),
  "minQuantity" DECIMAL(12,4),
  "minOrderAmount" DECIMAL(15,2),
  "startAt" TIMESTAMPTZ NOT NULL,
  "endAt" TIMESTAMPTZ NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  stackable BOOLEAN NOT NULL DEFAULT FALSE,
  "requiredPermission" TEXT NOT NULL DEFAULT 'DISCOUNT_MANAGE',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("minQuantity" IS NULL OR "minQuantity" > 0),
  CHECK ("minOrderAmount" IS NULL OR "minOrderAmount" >= 0),
  CHECK ("endAt" > "startAt")
);

CREATE INDEX IF NOT EXISTS pricing_promotions_scope_idx
  ON pricing_promotions ("tenantId","branchId","variantId","isActive","startAt","endAt",priority);
