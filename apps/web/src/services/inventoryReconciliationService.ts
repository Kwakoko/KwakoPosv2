/** Production inventory reconciliation for offline catalog convergence. */
import type { LocalIndexedDbStore, OutboxItem } from "../indexedDb.js";

export async function reconcileLocalInventoryToOutbox(
  db: LocalIndexedDbStore,
  tenantId?: string,
  branchId?: string,
): Promise<number> {
  if (!db || !db.products) return 0;
  let reconciled = 0;
  const tenant = tenantId || "tenant-default";
  const branch = branchId || "branch-default";
  const trackedProductIds = new Set<string>();
  const syncOutboxMap = (db as any).syncOutbox as Map<string, any> | undefined;
  if (syncOutboxMap) for (const item of syncOutboxMap.values()) if (item.tenantId === tenant && item.branchId === branch && item.entityType === "Product" && item.entityId) trackedProductIds.add(item.entityId);

  for (const [prodId, prod] of db.products.entries()) {
    const pAny = prod as any;
    if (pAny.tenantId && pAny.tenantId !== tenant) continue;
    if (pAny.branchId && pAny.branchId !== branch) continue;
    if (pAny.deletedAt || pAny.deleted_at || pAny.status === "Inactive" || pAny.synced || pAny.reconciledToOutbox) continue;
    if (trackedProductIds.has(prodId)) continue;
    const variants: any[] = [];
    for (const v of db.productVariants.values()) { const va=v as any; if (va.productId===prodId && (!va.tenantId||va.tenantId===tenant) && (!va.branchId||va.branchId===branch)) variants.push(va); }
    const defaultVarId = variants.length > 0 ? variants[0].id : `${prodId}-default`;
    const effectiveVariants = variants.length > 0 ? variants : [{
      id: defaultVarId, productId: prodId, name: "Standard", sku: `${pAny.sku || prodId}-STD`,
      price: Number(pAny.sellingPrice || 0), costPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
      stock: 0, inventoryQuantity: 0, isActive: true, tenantId: tenant, branchId: branch,
    }];
    const writes: any[] = [];
    if (variants.length === 0) writes.push({ store: "productVariants", key: defaultVarId, value: effectiveVariants[0] });
    const productPayload: Record<string, unknown> = {
      id: prodId, name: pAny.name, sku: pAny.sku || `SKU-${prodId.slice(0,6).toUpperCase()}`, category: pAny.category || "", brand: pAny.brand || "",
      buyingPrice: Number(pAny.buyingPrice || pAny.costPrice || 0), sellingPrice: Number(pAny.sellingPrice || 0), hasVariants: effectiveVariants.length > 1, variants: effectiveVariants,
    };
    const makeOutbox = (entityType: string, entityId: string, payload: Record<string, unknown>, idempotencyKey: string): OutboxItem => ({
      id: idempotencyKey, entityType: entityType as any, entityId, operationType: "CREATE", payload, clientCreatedAt: new Date().toISOString(), idempotencyKey, status: "PENDING", tenantId: tenant, branchId: branch,
    });
    const outboxItems: OutboxItem[] = [makeOutbox("Product", prodId, productPayload, `PROD-RECON-${prodId}`)];
    for (const v of effectiveVariants) {
      outboxItems.push(makeOutbox("ProductVariant", v.id, { ...v }, `VAR-RECON-${v.id}`));
      const vStock = Number(v.stock ?? v.inventoryQuantity ?? 0);
      if (vStock > 0) {
        const ledgerId = `led-recon-${v.id}`;
        const adjustmentId = `adj-recon-${v.id}`;
        writes.push({ store: "stockLedger", key: ledgerId, value: { id: ledgerId, tenantId: tenant, branchId: branch, productId: prodId, variantId: v.id, movementType: "OPENING_STOCK", referenceType: "ADJUSTMENT", referenceId: adjustmentId, quantityBefore: 0, quantityChange: vStock, quantity: vStock, quantityAfter: vStock, balanceAfter: vStock, unitCost: Number(v.costPrice || 0), totalCost: vStock * Number(v.costPrice || 0), occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(), operationId: adjustmentId, idempotencyKey: `ADJ-RECON-${v.id}`, synced: false } });
        outboxItems.push(makeOutbox("StockAdjustment", adjustmentId, { productId: prodId, variantId: v.id, sku: v.sku, adjustmentType: "INCREASE", movementType: "OPENING_STOCK", quantityChange: vStock, reason: "LOCAL_INVENTORY_RECONCILIATION", deviceId: "web-client", operationId: adjustmentId, idempotencyKey: `ADJ-RECON-${v.id}` }, `ADJ-RECON-${v.id}`));
      }
    }
    await db.executeAtomicMutation({ writes, outboxItems, tenantContext: { tenantId: tenant, branchId: branch } });
    pAny.reconciledToOutbox = true;
    reconciled += 1;
  }
  if (typeof (db as any).getFailedOutbox === "function" && typeof (db as any).retryOutbox === "function") { for (const item of (db as any).getFailedOutbox(tenant, branch)) (db as any).retryOutbox(item.id); }
  return reconciled;
}
