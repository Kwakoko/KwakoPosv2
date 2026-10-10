DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "product_variants"
     WHERE "barcode" IS NOT NULL
       AND btrim("barcode") <> ''
     GROUP BY "tenantId", "branchId", upper(btrim("barcode"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'RETAIL_BARCODE_DUPLICATES_BLOCK_MIGRATION: resolve duplicate non-empty barcodes per tenant/branch before applying the unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX "product_variants_tenant_branch_barcode_key"
  ON "product_variants" ("tenantId", "branchId", upper(btrim("barcode")))
  WHERE "barcode" IS NOT NULL AND btrim("barcode") <> '';
