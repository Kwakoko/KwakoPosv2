import type { StockLedger, StockMovementType } from "@kwakopos2/contracts";
import type { LocalIndexedDbStore, OutboxItem } from "../indexedDb.js";
import { safeUUID } from "./apiClient.js";
import { DATA_CHANGED_EVENT } from "./dataChangeEvent.js";

export const STOCK_CHANGED_EVENT = "kwakopos:stock-changed";

export interface AddStockCommand {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  reason: string;
  notes?: string;
  movementType?: "ADJUSTMENT_GAIN" | "OPENING_STOCK";
  userId?: string;
  deviceId: string;
}

export interface QueuedStockMovement {
  adjustmentId: string;
  ledgerId: string;
  operationId: string;
  idempotencyKey: string;
  quantityBefore: number;
  quantityAfter: number;
}

export interface PosSaleStockItem {
  productId: string;
  variantId?: string;
  qty: number;
  unitCost?: number;
  name?: string;
  sku?: string;
}

export interface PosSaleStockParams {
  saleId: string;
  items: PosSaleStockItem[];
  tenantId: string;
  branchId: string;
  userId?: string;
  deviceId?: string;
}

export interface PosRefundStockParams {
  saleId: string;
  items: PosSaleStockItem[];
  tenantId: string;
  branchId: string;
  userId?: string;
  deviceId?: string;
}

/**
 * Derives the authoritative stock for a variant or product in local IndexedDB.
 */
export function getEffectiveStock(
  db: LocalIndexedDbStore,
  variantId?: string,
  productId?: string,
  tenantId?: string,
  branchId?: string,
): { stock: number; inventoryQuantity: number; ledgerBalance: number } {
  let ledgerBalance = 0;
  for (const entry of db.stockLedger.values()) {
    const l = entry as any;
    if (tenantId && l.tenantId && l.tenantId !== tenantId) continue;
    if (branchId && l.branchId && l.branchId !== branchId) continue;
    if (variantId && l.variantId === variantId) {
      ledgerBalance += Number(l.quantityChange ?? l.quantity ?? 0);
    } else if (!variantId && productId && l.productId === productId) {
      ledgerBalance += Number(l.quantityChange ?? l.quantity ?? 0);
    }
  }

  let inventoryQuantity = 0;
  if (variantId && db.productVariants) {
    const variant = db.productVariants.get(variantId) as any;
    if (variant) {
      inventoryQuantity = Number(variant.inventoryQuantity ?? variant.stock ?? 0);
    }
  } else if (productId && db.products) {
    const prod = db.products.get(productId) as any;
    if (prod) {
      inventoryQuantity = Number(prod.availableStock ?? prod.totalStock ?? prod.stock ?? 0);
    }
  }

  const stock = Math.max(0, inventoryQuantity > 0 ? inventoryQuantity : ledgerBalance);
  return { stock, inventoryQuantity, ledgerBalance };
}

/**
 * Adds stock to a specific product variant, materializing it across
 * db.stockLedger, db.productVariants, db.products, and the sync outbox.
 */
export async function queueAddStock(
  db: LocalIndexedDbStore,
  command: AddStockCommand,
): Promise<QueuedStockMovement> {
  const quantity = Number(command.quantity);
  const unitCost = Number(command.unitCost);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Stock quantity must be greater than zero");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Unit cost cannot be negative");
  if (!command.tenantId || !command.branchId || !command.productId || !command.variantId) {
    throw new Error("Tenant, branch, product, and variant are required");
  }

  const movementType: StockMovementType = command.movementType === "OPENING_STOCK" ? "OPENING_STOCK" : "ADJUSTMENT_GAIN";
  const adjustmentId = safeUUID();
  const ledgerId = safeUUID();
  const operationId = safeUUID();
  const idempotencyKey = `STOCK-IN-${operationId}`;
  const occurredAt = new Date().toISOString();

  // Find existing variant
  let variant = db.productVariants.get(command.variantId) as any;
  if (!variant) {
    for (const v of db.productVariants.values()) {
      if (v.id === command.variantId || (v.productId === command.productId && v.sku === command.sku)) {
        variant = v;
        break;
      }
    }
  }

  // Determine prior quantity
  const priorLedger = [...db.stockLedger.values()].filter((entry: any) =>
    entry.tenantId === command.tenantId && entry.branchId === command.branchId && entry.variantId === command.variantId,
  );
  const ledgerSum = priorLedger.reduce((sum, entry: any) => sum + Number(entry.quantityChange ?? entry.quantity ?? 0), 0);
  const quantityBefore = variant ? Number(variant.inventoryQuantity ?? variant.stock ?? ledgerSum) : ledgerSum;
  const quantityAfter = quantityBefore + quantity;
  const referenceNote = command.notes?.trim() || command.reason.trim();

  const ledger: StockLedger = {
    id: ledgerId,
    tenantId: command.tenantId,
    branchId: command.branchId,
    productId: command.productId,
    variantId: command.variantId,
    movementType,
    referenceType: "ADJUSTMENT",
    referenceId: adjustmentId,
    quantityBefore,
    quantityChange: quantity,
    quantity,
    quantityAfter,
    unitCost,
    totalCost: quantity * unitCost,
    userId: command.userId || undefined,
    deviceId: command.deviceId,
    operationId,
    idempotencyKey,
    notes: referenceNote,
    synced: false,
    occurredAt,
    createdAt: occurredAt,
  };

  const outbox: OutboxItem = {
    id: operationId,
    entityType: "StockAdjustment",
    entityId: adjustmentId,
    operationType: "CREATE",
    payload: {
      id: adjustmentId,
      productId: command.productId,
      variantId: command.variantId,
      adjustmentType: "INCREASE",
      movementType,
      quantityChange: quantity,
      reason: command.reason.trim(),
      referenceNote,
      unitCost,
      ledgerId,
      userId: command.userId,
      deviceId: command.deviceId,
      operationId,
      idempotencyKey,
    },
    clientCreatedAt: occurredAt,
    idempotencyKey,
    status: "PENDING",
    tenantId: command.tenantId,
    branchId: command.branchId,
  };

  // 1. Commit atomic transaction for StockLedger and SyncOutbox
  await db.executeAtomicBusinessTransaction({
    targetStore: "stockLedger",
    entityId: ledgerId,
    entityData: ledger,
    outboxItem: outbox,
    tenantContext: { tenantId: command.tenantId, branchId: command.branchId },
  });

  // 2. Materialize to db.productVariants
  const updatedVariant = {
    ...(variant || {
      id: command.variantId,
      productId: command.productId,
      name: command.productName || "Standard",
      sku: command.sku,
      price: unitCost * 1.3,
      costPrice: unitCost,
      reorderLevel: 5,
      isActive: true,
    }),
    inventoryQuantity: quantityAfter,
    stock: quantityAfter,
    tenantId: command.tenantId,
    branchId: command.branchId,
    updatedAt: occurredAt,
  };
  db.saveVariantLocal(updatedVariant, { tenantId: command.tenantId, branchId: command.branchId });

  // 3. Materialize to db.products
  const prod = db.products.get(command.productId) as any;
  if (prod) {
    const siblingVariants = Array.from(db.productVariants.values()).filter((v: any) => v.productId === command.productId);
    const sumStock = siblingVariants.length > 0
      ? siblingVariants.reduce((sum: number, v: any) => sum + Number(v.inventoryQuantity ?? v.stock ?? 0), 0)
      : Math.max(0, Number(prod.totalStock ?? prod.stock ?? 0) + quantity);

    const updatedProd = {
      ...prod,
      availableStock: sumStock,
      totalStock: sumStock,
      stock: sumStock,
      updatedAt: occurredAt,
    };
    db.saveProductLocal(updatedProd, { tenantId: command.tenantId, branchId: command.branchId });
  }

  // 4. Notify UI subscribers across modules
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { productId: command.productId, variantId: command.variantId, quantityAfter } }));
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "INVENTORY_CHANGED" } }));
    window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { operationId, entityType: "StockAdjustment" } }));
  }

  return { adjustmentId, ledgerId, operationId, idempotencyKey, quantityBefore, quantityAfter };
}

/**
 * Records stock deductions for a completed POS checkout across variants,
 * products, and ledger, keeping POS and Inventory 100% in sync.
 */
export function recordPosSaleDeductions(
  db: LocalIndexedDbStore,
  params: PosSaleStockParams,
): void {
  const { saleId, items, tenantId, branchId, userId, deviceId } = params;
  const occurredAt = new Date().toISOString();
  const ctx = { tenantId, branchId };

  for (const item of items) {
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    // Find product
    let prod = db.products.get(item.productId) as any;
    if (!prod) {
      for (const p of db.products.values()) {
        if (p.id === item.productId || (item.sku && p.sku === item.sku)) {
          prod = p;
          break;
        }
      }
    }
    if (!prod) continue;

    // Find variant
    let targetVariant: any = null;
    if (item.variantId) {
      targetVariant = db.productVariants.get(item.variantId);
    }
    if (!targetVariant && db.productVariants) {
      for (const v of db.productVariants.values()) {
        if (v.productId === prod.id && (item.variantId ? v.id === item.variantId : true)) {
          targetVariant = v;
          break;
        }
      }
    }

    // Determine variant & product quantities before & after
    const prevVarStock = targetVariant
      ? Number(targetVariant.inventoryQuantity ?? targetVariant.stock ?? 0)
      : Number(prod.availableStock ?? prod.totalStock ?? prod.stock ?? 0);
    const nextVarStock = Math.max(0, prevVarStock - qty);

    const prevProdAvail = Number(prod.availableStock ?? prod.totalStock ?? prod.stock ?? 0);
    const prevProdTotal = Number(prod.totalStock ?? prod.stock ?? 0);
    const nextProdAvail = Math.max(0, prevProdAvail - qty);
    const nextProdTotal = Math.max(0, prevProdTotal - qty);

    const resolvedVariantId = targetVariant?.id || item.variantId || `${prod.id}-default`;

    // 1. Update Variant in db.productVariants
    if (targetVariant) {
      const updatedVar = {
        ...targetVariant,
        inventoryQuantity: nextVarStock,
        stock: nextVarStock,
        updatedAt: occurredAt,
      };
      db.saveVariantLocal(updatedVar, ctx);
    } else {
      db.saveVariantLocal(
        {
          id: resolvedVariantId,
          productId: prod.id,
          name: "Standard",
          sku: `${prod.sku || prod.id}-STD`,
          price: Number(prod.sellingPrice || prod.price || 0),
          costPrice: Number(prod.buyingPrice || prod.costPrice || 0),
          inventoryQuantity: nextVarStock,
          stock: nextVarStock,
          isActive: true,
          tenantId,
          branchId,
        } as any,
        ctx,
      );
    }

    // 2. Update Product in db.products
    const updatedProd = {
      ...prod,
      availableStock: nextProdAvail,
      totalStock: nextProdTotal,
      stock: nextProdAvail,
      updatedAt: occurredAt,
    };
    db.saveProductLocal(updatedProd, ctx);

    // 3. Save StockLedger entry with full audit fields
    const unitCost = Number(item.unitCost || prod.costPrice || prod.buyingPrice || 0);
    const ledgerRecord: StockLedger = {
      id: `led-${saleId}-${resolvedVariantId}`,
      tenantId,
      branchId,
      productId: prod.id,
      variantId: resolvedVariantId,
      movementType: "SALE",
      referenceType: "SALE",
      referenceId: saleId,
      quantityBefore: prevVarStock,
      quantityChange: -qty,
      quantity: -qty,
      quantityAfter: nextVarStock,
      unitCost,
      totalCost: qty * unitCost,
      userId: userId || undefined,
      deviceId: deviceId || "pos-terminal",
      operationId: `sale-stock-${saleId}-${resolvedVariantId}`,
      idempotencyKey: `SALE-STOCK-${saleId}-${resolvedVariantId}`,
      notes: `POS Sale ${saleId}`,
      synced: false,
      occurredAt,
      createdAt: occurredAt,
    };

    db.saveStockLedgerLocal(ledgerRecord as any, ctx);

    // Record local pending StockAdjustment delta so merge reconciliation applies relative mutations over incoming server snapshots
    const adjustmentRecord: any = {
      id: `adj-sale-${saleId}-${resolvedVariantId}`,
      tenantId,
      branchId,
      productId: prod.id,
      variantId: resolvedVariantId,
      sku: targetVariant?.sku || prod.sku,
      adjustmentType: "DECREASE",
      quantityChange: -qty,
      change: -qty,
      reason: `POS Sale ${saleId}`,
      status: "PENDING",
      deviceId: deviceId || "pos-terminal",
      operationId: `adj-sale-${saleId}-${resolvedVariantId}`,
      idempotencyKey: `ADJ-SALE-${saleId}-${resolvedVariantId}`,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    db.saveStockAdjustmentLocal(adjustmentRecord as any, ctx);
  }

  // 4. Dispatch events for real-time reactivity in both POS and Inventory views
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { saleId, items } }));
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "INVENTORY_CHANGED" } }));
  }
}

/**
 * Records restocked inventory for customer returns/refunds.
 */
export function recordPosSaleRefundRestock(
  db: LocalIndexedDbStore,
  params: PosRefundStockParams,
): void {
  const { saleId, items, tenantId, branchId, userId, deviceId } = params;
  const occurredAt = new Date().toISOString();
  const ctx = { tenantId, branchId };

  for (const item of items) {
    const returnedQty = Number(item.qty);
    if (!Number.isFinite(returnedQty) || returnedQty <= 0) continue;

    let prod = db.products.get(item.productId) as any;
    if (!prod) {
      for (const p of db.products.values()) {
        if (p.id === item.productId || (item.sku && p.sku === item.sku)) {
          prod = p;
          break;
        }
      }
    }
    if (!prod) continue;

    let targetVariant: any = null;
    if (item.variantId) {
      targetVariant = db.productVariants.get(item.variantId);
    }
    if (!targetVariant && db.productVariants) {
      for (const v of db.productVariants.values()) {
        if (v.productId === prod.id) {
          targetVariant = v;
          break;
        }
      }
    }

    const prevVarStock = targetVariant
      ? Number(targetVariant.inventoryQuantity ?? targetVariant.stock ?? 0)
      : Number(prod.availableStock ?? prod.totalStock ?? prod.stock ?? 0);
    const nextVarStock = prevVarStock + returnedQty;

    const prevProdAvail = Number(prod.availableStock ?? prod.totalStock ?? prod.stock ?? 0);
    const prevProdTotal = Number(prod.totalStock ?? prod.stock ?? 0);
    const nextProdAvail = prevProdAvail + returnedQty;
    const nextProdTotal = prevProdTotal + returnedQty;

    const resolvedVariantId = targetVariant?.id || item.variantId || `${prod.id}-default`;

    // 1. Update variant
    if (targetVariant) {
      db.saveVariantLocal({ ...targetVariant, inventoryQuantity: nextVarStock, stock: nextVarStock, updatedAt: occurredAt }, ctx);
    }

    // 2. Update product
    db.saveProductLocal({ ...prod, availableStock: nextProdAvail, totalStock: nextProdTotal, stock: nextProdAvail, updatedAt: occurredAt }, ctx);

    // 3. Save ledger record
    const unitCost = Number(item.unitCost || prod.costPrice || prod.buyingPrice || 0);
    const ledgerRecord: StockLedger = {
      id: `led-refund-${saleId}-${resolvedVariantId}`,
      tenantId,
      branchId,
      productId: prod.id,
      variantId: resolvedVariantId,
      movementType: "CUSTOMER_RETURN",
      referenceType: "RETURN",
      referenceId: saleId,
      quantityBefore: prevVarStock,
      quantityChange: returnedQty,
      quantity: returnedQty,
      quantityAfter: nextVarStock,
      unitCost,
      totalCost: returnedQty * unitCost,
      userId: userId || undefined,
      deviceId: deviceId || "pos-terminal",
      operationId: `refund-stock-${saleId}-${resolvedVariantId}`,
      idempotencyKey: `REFUND-STOCK-${saleId}-${resolvedVariantId}`,
      notes: `POS Refund Restock for Sale ${saleId}`,
      synced: false,
      occurredAt,
      createdAt: occurredAt,
    };
    db.saveStockLedgerLocal(ledgerRecord as any, ctx);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { saleId, items } }));
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "INVENTORY_CHANGED" } }));
  }
}


