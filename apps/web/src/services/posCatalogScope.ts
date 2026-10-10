/**
 * Fail-closed tenant and branch scope filter for the local POS catalog.
 *
 * IndexedDB is shared across authenticated contexts on a device, so consumers
 * must never treat all locally cached products/variants as the active catalog.
 */
export interface ScopedPosCatalogRecord {
  id: string;
  tenantId?: string | null;
  branchId?: string | null;
  tenant_id?: string | null;
  branch_id?: string | null;
}

export interface ScopedPosVariantRecord extends ScopedPosCatalogRecord {
  productId: string;
}

export function filterRecordsToTenantBranchScope<TRecord extends ScopedPosCatalogRecord>(
  records: readonly TRecord[],
  tenantId: string | null | undefined,
  branchId: string | null | undefined,
): TRecord[] {
  if (!tenantId || !branchId) return [];
  return records.filter((record) =>
    (record.tenantId ?? record.tenant_id) === tenantId &&
    (record.branchId ?? record.branch_id) === branchId,
  );
}

export function filterPosCatalogToScope<
  TProduct extends ScopedPosCatalogRecord,
  TVariant extends ScopedPosVariantRecord,
>(
  products: readonly TProduct[],
  variants: readonly TVariant[],
  tenantId: string | null | undefined,
  branchId: string | null | undefined,
): { products: TProduct[]; variants: TVariant[] } {
  const scopedProducts = filterRecordsToTenantBranchScope(products, tenantId, branchId);
  const scopedProductIds = new Set(scopedProducts.map((product) => product.id));
  const scopedVariants = filterRecordsToTenantBranchScope(variants, tenantId, branchId)
    .filter((variant) => scopedProductIds.has(variant.productId));

  return { products: scopedProducts, variants: scopedVariants };
}
