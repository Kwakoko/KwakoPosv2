/** Production inventory reconciliation for offline catalog convergence. */
import type { LocalIndexedDbStore } from "../indexedDb.js";

export function reconcileLocalInventoryToOutbox(
  db: LocalIndexedDbStore,
  tenantId?: string,
  branchId?: string,
): number {
  if (!db || !db.products) return 0;
  let reconciled = 0;

  // 1. Check existing outbox to see which product IDs are already tracked
  const trackedProductIds = new Set<string>();
  const syncOutboxMap = (db as any).syncOutbox as Map<string, any> | undefined;
  if (syncOutboxMap) {
    for (const item of syncOutboxMap.values()) {
      if (item.entityType === "Product" && item.entityId) {
        trackedProductIds.add(item.entityId);
      }
    }
  }

  // 2. For any product in db.products not in outbox, enqueue it
  for (const [prodId, prod] of db.products.entries()) {
    const pAny = prod as any;
    if (pAny.deletedAt || pAny.deleted_at || pAny.status === "Inactive" || pAny.synced || pAny.reconciledToOutbox) continue;
    if (!trackedProductIds.has(prodId)) {
      // Find variants for this product
      const variants: any[] = [];
      if (db.productVariants) {
        for (const v of db.productVariants.values()) {
          const vAny = v as any;
          if (vAny.productId === prodId) {
            variants.push(vAny);
          }
        }
      }

      const defaultVarId = variants.length > 0 ? variants[0].id : `${prodId}-default`;
      const effectiveVariants = variants.length > 0 ? variants : [
        {
          id: defaultVarId,
          productId: prodId,
          name: "Standard",
          sku: `${pAny.sku || prodId}-STD`,
          price: Number(pAny.sellingPrice || 0),
          costPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
          stock: Number(pAny.stock || pAny.availableStock || pAny.totalStock || 0),
          inventoryQuantity: Number(pAny.stock || pAny.availableStock || pAny.totalStock || 0),
          isActive: true,
        },
      ];

      if (variants.length === 0) {
        db.saveVariantLocal(effectiveVariants[0], tenantId ? { tenantId } : undefined);
      }

      db.enqueueOutbox({
        entityType: "Product",
        entityId: prodId,
        operationType: "CREATE",
        payload: {
          id: prodId,
          name: pAny.name,
          sku: pAny.sku || `SKU-${prodId.slice(0, 6).toUpperCase()}`,
          category: pAny.category || "",
          brand: pAny.brand || "",
          buyingPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
          sellingPrice: Number(pAny.sellingPrice || 0),
          hasVariants: effectiveVariants.length > 1,
          variants: effectiveVariants,
        },
        idempotencyKey: `PROD-RECON-${prodId}`,
        tenantId: tenantId || pAny.tenantId || undefined,
        branchId: branchId || pAny.branchId || undefined,
      });

      for (const v of effectiveVariants) {
        db.enqueueOutbox({
          entityType: "ProductVariant",
          entityId: v.id,
          operationType: "CREATE",
          payload: v,
          idempotencyKey: `VAR-RECON-${v.id}`,
          tenantId: tenantId || pAny.tenantId || undefined,
          branchId: branchId || pAny.branchId || undefined,
        });

        const vStock = Number(v.stock ?? v.inventoryQuantity ?? pAny.stock ?? 0);
        if (vStock > 0) {
          db.enqueueOutbox({
            entityType: "StockAdjustment",
            entityId: `adj-${v.id}`,
            operationType: "CREATE",
            payload: {
              productId: prodId,
              variantId: v.id,
              sku: v.sku,
              adjustmentType: "INCREASE",
              quantityChange: vStock,
              reason: "LOCAL_INVENTORY_RECONCILIATION",
              deviceId: "web-client",
              operationId: `adj-${v.id}`,
              idempotencyKey: `ADJ-RECON-${v.id}`,
            },
            idempotencyKey: `ADJ-RECON-${v.id}`,
            tenantId: tenantId || pAny.tenantId || undefined,
            branchId: branchId || pAny.branchId || undefined,
          });
        }
      }
      pAny.reconciledToOutbox = true;
      reconciled += 1;
    }
  }

  // 3. Retry any failed outbox items
  if (typeof (db as any).getFailedOutbox === "function" && typeof (db as any).retryOutbox === "function") {
    const failed = (db as any).getFailedOutbox(tenantId);
    for (const item of failed) {
      (db as any).retryOutbox(item.id);
    }
  }

  return reconciled;
}
