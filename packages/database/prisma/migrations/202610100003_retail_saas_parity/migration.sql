ALTER TABLE "pricing_promotions"
  ADD COLUMN "buyQuantity" DECIMAL(12,4),
  ADD COLUMN "getQuantity" DECIMAL(12,4),
  ADD COLUMN "rewardVariantId" TEXT;

ALTER TABLE "sales_orders"
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'POS',
  ADD COLUMN "externalOrderId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "fulfillmentType" TEXT NOT NULL DEFAULT 'PICKUP',
  ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'UNFULFILLED',
  ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "trackingReference" TEXT,
  ADD COLUMN "inventoryReservedAt" TIMESTAMP(3),
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3);

ALTER TABLE "sales_order_items"
  ADD COLUMN "fulfilledQuantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "externalLineId" TEXT;

CREATE UNIQUE INDEX "sales_orders_tenantId_idempotencyKey_key"
  ON "sales_orders"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "sales_orders_tenantId_channel_externalOrderId_key"
  ON "sales_orders"("tenantId", "channel", "externalOrderId");
CREATE INDEX "sales_orders_tenantId_branchId_channel_status_createdAt_idx"
  ON "sales_orders"("tenantId", "branchId", "channel", "status", "createdAt");

CREATE TABLE "loyalty_programs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "currencyUnitsPerPoint" DECIMAL(12,2) NOT NULL DEFAULT 1000,
  "currencyValuePerPoint" DECIMAL(12,2) NOT NULL DEFAULT 1,
  "maxRedemptionPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loyalty_programs_tenantId_branchId_key"
  ON "loyalty_programs"("tenantId", "branchId");
ALTER TABLE "loyalty_programs"
  ADD CONSTRAINT "loyalty_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "loyalty_programs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "loyalty_ledger_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "entryType" TEXT NOT NULL,
  "pointsDelta" INTEGER NOT NULL,
  "monetaryValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loyalty_ledger_entries_tenantId_idempotencyKey_key"
  ON "loyalty_ledger_entries"("tenantId", "idempotencyKey");
CREATE INDEX "loyalty_ledger_entries_tenantId_branchId_customerId_createdAt_idx"
  ON "loyalty_ledger_entries"("tenantId", "branchId", "customerId", "createdAt");
CREATE INDEX "loyalty_ledger_entries_tenantId_referenceType_referenceId_idx"
  ON "loyalty_ledger_entries"("tenantId", "referenceType", "referenceId");
ALTER TABLE "loyalty_ledger_entries"
  ADD CONSTRAINT "loyalty_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "loyalty_ledger_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "loyalty_ledger_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sale_exchanges" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "exchangeNumber" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "originalSaleId" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "replacementSaleId" TEXT NOT NULL,
  "customerId" TEXT,
  "returnAmount" DECIMAL(12,2) NOT NULL,
  "replacementAmount" DECIMAL(12,2) NOT NULL,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "settlementStatus" TEXT NOT NULL DEFAULT 'SETTLEMENT_REQUIRED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_exchanges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_exchanges_returnId_key" ON "sale_exchanges"("returnId");
CREATE UNIQUE INDEX "sale_exchanges_replacementSaleId_key" ON "sale_exchanges"("replacementSaleId");
CREATE UNIQUE INDEX "sale_exchanges_tenantId_branchId_exchangeNumber_key"
  ON "sale_exchanges"("tenantId", "branchId", "exchangeNumber");
CREATE UNIQUE INDEX "sale_exchanges_tenantId_idempotencyKey_key"
  ON "sale_exchanges"("tenantId", "idempotencyKey");
CREATE INDEX "sale_exchanges_tenantId_branchId_createdAt_idx"
  ON "sale_exchanges"("tenantId", "branchId", "createdAt");
ALTER TABLE "sale_exchanges"
  ADD CONSTRAINT "sale_exchanges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "sale_exchanges_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "sale_exchanges_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sale_exchanges_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sale_exchanges_replacementSaleId_fkey" FOREIGN KEY ("replacementSaleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sale_exchanges_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sale_exchange_lines" (
  "id" TEXT NOT NULL,
  "exchangeId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "sale_exchange_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sale_exchange_lines_exchangeId_side_idx"
  ON "sale_exchange_lines"("exchangeId", "side");
ALTER TABLE "sale_exchange_lines"
  ADD CONSTRAINT "sale_exchange_lines_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "sale_exchanges"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "sale_exchange_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD COLUMN "salesOrderId" TEXT;

CREATE INDEX "payments_tenantId_branchId_salesOrderId_idx"
  ON "payments"("tenantId", "branchId", "salesOrderId");
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth: new tenant-owned aggregate roots use the same tenant context as the existing commercial core.
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_sales_orders ON "sales_orders";
CREATE POLICY kwakopos_tenant_sales_orders ON "sales_orders"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "sales_order_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_sales_order_items ON "sales_order_items";
CREATE POLICY kwakopos_tenant_sales_order_items ON "sales_order_items"
  USING (EXISTS (
    SELECT 1 FROM "sales_orders" so WHERE so."id" = "sales_order_items"."salesOrderId"
      AND (so."tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "sales_orders" so WHERE so."id" = "sales_order_items"."salesOrderId"
      AND (so."tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  ));

ALTER TABLE "loyalty_programs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_tenant_loyalty_programs ON "loyalty_programs"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "loyalty_ledger_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_tenant_loyalty_ledger_entries ON "loyalty_ledger_entries"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "sale_exchanges" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_tenant_sale_exchanges ON "sale_exchanges"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "sale_exchange_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kwakopos_tenant_sale_exchange_lines ON "sale_exchange_lines"
  USING (EXISTS (
    SELECT 1 FROM "sale_exchanges" se WHERE se."id" = "sale_exchange_lines"."exchangeId"
      AND (se."tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "sale_exchanges" se WHERE se."id" = "sale_exchange_lines"."exchangeId"
      AND (se."tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  ));

ALTER TABLE "pricing_promotions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_pricing_promotions ON "pricing_promotions";
CREATE POLICY kwakopos_tenant_pricing_promotions ON "pricing_promotions"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

-- Points are a financial benefit ledger: corrections are new signed entries, never edits/deletes.
CREATE OR REPLACE FUNCTION prevent_loyalty_ledger_entries_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LOYALTY_LEDGER_APPEND_ONLY: loyalty ledger entries cannot be updated or deleted';
END;
$$;

CREATE TRIGGER loyalty_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON "loyalty_ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION prevent_loyalty_ledger_entries_mutation();
