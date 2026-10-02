CREATE INDEX "product_variants_tenantId_branchId_barcode_idx"
ON "product_variants"("tenantId","branchId","barcode")
WHERE "barcode" IS NOT NULL;
