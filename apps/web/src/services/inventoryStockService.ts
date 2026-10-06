import type { StockLedger, StockMovementType } from "@kwakopos2/contracts";
import {
  assertBackdatingThreshold,
  calculateStockAsOfDate,
  calculateBackdatedDiscrepancy,
  validateRetroactiveTimeline,
} from "@kwakopos2/domain";
import type { LocalIndexedDbStore, OutboxItem } from "../indexedDb.js";
import { safeUUID } from "./apiClient.js";
import { DATA_CHANGED_EVENT, publishDataChanged } from "./dataChangeEvent.js";

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
  occurredAt?: string;
}

export interface StockAdjustmentCommand {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  adjustmentType: "INCREASE" | "DECREASE" | "SET";
  quantity: number;
  unitCost?: number;
  reason: string;
  notes?: string;
  movementType?: StockMovementType;
  userId?: string;
  deviceId: string;
  occurredAt?: string;
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
export interface StockBalanceProjection {
  byVariant: Map<string, number>;
  byProduct: Map<string, number>;
}

/** Build the inventory balance projection exclusively from Stock Ledger. */
export function buildStockBalanceProjection(
  db?: LocalIndexedDbStore | null,
  tenantId?: string | null,
  branchId?: string | null,
): StockBalanceProjection {
  const byVariant = new Map<string, number>();
  const byProduct = new Map<string, number>();
  if (!db?.stockLedger || !tenantId || !branchId) return { byVariant, byProduct };

  for (const entry of db.stockLedger.values()) {
    const l = entry as any;
    if (l.tenantId !== tenantId || l.branchId !== branchId) continue;
    const change = Number(l.quantityChange ?? l.quantity ?? 0);
    if (!Number.isFinite(change)) continue;
    if (l.variantId) byVariant.set(String(l.variantId), (byVariant.get(String(l.variantId)) || 0) + change);
    if (l.productId) byProduct.set(String(l.productId), (byProduct.get(String(l.productId)) || 0) + change);
  }
  return { byVariant, byProduct };
}

export function getEffectiveStock(
  db?: LocalIndexedDbStore | null,
  variantId?: string | null,
  productId?: string | null,
  tenantId?: string | null,
  branchId?: string | null,
): { stock: number; inventoryQuantity: number; ledgerBalance: number } {
  const projection = buildStockBalanceProjection(db, tenantId, branchId);
  const ledgerBalance = variantId
    ? Number(projection.byVariant.get(String(variantId)) || 0)
    : productId
      ? Number(projection.byProduct.get(String(productId)) || 0)
      : 0;

  let inventoryQuantity = 0;
  if (variantId && db?.productVariants) {
    const variant = db.productVariants.get(variantId) as any;
    if (variant && variant.tenantId === tenantId && variant.branchId === branchId) {
      inventoryQuantity = Number(variant.inventoryQuantity ?? variant.stock ?? 0);
    }
  } else if (productId && db?.products) {
    const prod = db.products.get(productId) as any;
    if (prod && prod.tenantId === tenantId && prod.branchId === branchId) {
      inventoryQuantity = Number(prod.availableStock ?? prod.totalStock ?? prod.stock ?? 0);
    }
  }

  // Stock Ledger is authoritative; projections are derived and never override ledger truth.
  const stock = Math.max(0, ledgerBalance);
  return { stock, inventoryQuantity, ledgerBalance };
}

/**
 * Calculates stock balance for a variant at a historical point-in-time from local ledger.
 * Completely guarded against null/undefined stores, invalid date strings, and throwing during render passes.
 */
export function calculateLocalStockAsOfDate(
  db?: LocalIndexedDbStore | null,
  variantId?: string | null,
  asOfDate?: string | Date | null,
  tenantId?: string | null,
  branchId?: string | null,
): number {
  if (!db?.stockLedger || !variantId || !asOfDate) {
    return 0;
  }
  const dateObj = new Date(asOfDate);
  if (Number.isNaN(dateObj.getTime())) {
    return 0;
  }
  try {
    const entries: any[] = [];
    for (const entry of db.stockLedger.values()) {
      const l = entry as any;
      if (tenantId && l.tenantId && l.tenantId !== tenantId) continue;
      if (branchId && l.branchId && l.branchId !== branchId) continue;
      if (l.variantId === variantId) {
        entries.push(l);
      }
    }
    return calculateStockAsOfDate(entries, dateObj);
  } catch (err) {
    console.warn("[inventoryStockService] calculateLocalStockAsOfDate non-fatal error:", err);
    return 0;
  }
}

/**
 * Queues a full stock adjustment (INCREASE, DECREASE, or SET count) with optional backdating.
 * Enforces the 2-year threshold limit and validates retroactive timelines to prevent negative balances.
 */
export async function queueStockAdjustment(
  db: LocalIndexedDbStore,
  command: StockAdjustmentCommand,
): Promise<QueuedStockMovement> {
  if (!command.tenantId || !command.branchId || !command.productId || !command.variantId) {
    throw new Error("Tenant, branch, product, and variant are required");
  }

  const occurredAt = command.occurredAt || new Date().toISOString();
  // Enforce threshold (up to 2 years / 730 days max, clock skew allowed, no far future)
  assertBackdatingThreshold(occurredAt);

  const isBackdated = Math.abs(Date.now() - new Date(occurredAt).getTime()) > 5 * 60 * 1000;

  // Retrieve existing ledger entries for this variant
  const existingLedger = [...db.stockLedger.values()].filter(
    (entry: any) =>
      entry.tenantId === command.tenantId &&
      entry.branchId === command.branchId &&
      entry.variantId === command.variantId,
  );

  const currentLedgerBalance = existingLedger.reduce(
    (sum, entry: any) => sum + Number(entry.quantityChange ?? entry.quantity ?? 0),
    0,
  );

  let delta = 0;
  let movementType: StockMovementType = command.movementType || "ADJUSTMENT_GAIN";
  const rawQty = Number(command.quantity);
  if (!Number.isFinite(rawQty)) {
    throw new Error("Invalid quantity specified");
  }

  if (command.adjustmentType === "INCREASE") {
    if (rawQty <= 0) throw new Error("Increase quantity must be positive");
    delta = rawQty;
    movementType = command.movementType || "ADJUSTMENT_GAIN";
  } else if (command.adjustmentType === "DECREASE") {
    if (rawQty <= 0) throw new Error("Decrease quantity must be positive");
    delta = -rawQty;
    movementType = command.movementType || "ADJUSTMENT_LOSS";
  } else if (command.adjustmentType === "SET") {
    if (rawQty < 0) throw new Error("Target count cannot be negative");
    if (isBackdated) {
      const historicalStock = calculateStockAsOfDate(existingLedger, occurredAt);
      delta = calculateBackdatedDiscrepancy(rawQty, historicalStock);
    } else {
      delta = rawQty - currentLedgerBalance;
    }
    movementType = command.movementType || (delta >= 0 ? "ADJUSTMENT_GAIN" : "ADJUSTMENT_LOSS");
  }

  if (delta === 0) {
    return {
      adjustmentId: `adj-noop-${safeUUID()}`,
      ledgerId: `led-noop-${safeUUID()}`,
      operationId: `op-noop-${safeUUID()}`,
      idempotencyKey: `NOOP-${safeUUID()}`,
      quantityBefore: currentLedgerBalance,
      quantityAfter: currentLedgerBalance,
    };
  }

  // Validate retroactive timeline if deducting stock
  if (delta < 0) {
    validateRetroactiveTimeline(existingLedger, occurredAt, delta);
  }

  const quantityBefore = currentLedgerBalance;
  const quantityAfter = currentLedgerBalance + delta;
  if (quantityAfter < 0) {
    throw new Error(`INSUFFICIENT_STOCK: Adjustment would result in negative stock balance (${quantityAfter})`);
  }

  let variant = db.productVariants.get(command.variantId) as any;
  if (!variant) {
    for (const v of db.productVariants.values()) {
      if (v.id === command.variantId) {
        variant = v;
        break;
      }
    }
  }
  if (!variant || variant.tenantId !== command.tenantId || variant.branchId !== command.branchId || variant.productId !== command.productId) {
    throw new Error("TENANT_BRANCH_VARIANT_OWNERSHIP_VIOLATION");
  }

  const unitCost = Number(command.unitCost ?? variant.costPrice ?? variant.price ?? 0);
  const adjustmentId = safeUUID();
  const ledgerId = safeUUID();
  const operationId = `op-stock-${adjustmentId}`;
  const idempotencyKey = `ADJ-${command.tenantId}-${command.branchId}-${command.variantId}-${Date.parse(occurredAt)}-${delta}`;
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
    quantityChange: delta,
    quantity: delta,
    quantityAfter,
    unitCost,
    totalCost: Math.abs(delta) * unitCost,
    userId: command.userId || undefined,
    deviceId: command.deviceId,
    operationId,
    idempotencyKey,
    notes: referenceNote,
    synced: false,
    occurredAt,
    createdAt: occurredAt,
  };

  const adjustment: any = {
    id: adjustmentId,
    tenantId: command.tenantId,
    branchId: command.branchId,
    variantId: command.variantId,
    adjustmentType: command.adjustmentType,
    quantityChange: delta,
    reason: command.reason.trim(),
    referenceNote,
    status: "COMPLETED",
    createdByUserId: command.userId || "SYSTEM",
    deviceId: command.deviceId,
    operationId,
    idempotencyKey,
    createdAt: occurredAt,
    updatedAt: new Date().toISOString(),
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
      adjustmentType: command.adjustmentType,
      movementType,
      quantityChange: delta,
      quantity: rawQty,
      reason: command.reason.trim(),
      referenceNote,
      unitCost,
      ledgerId,
      userId: command.userId,
      deviceId: command.deviceId,
      operationId,
      idempotencyKey,
      occurredAt,
      isBackdated,
    },
    clientCreatedAt: occurredAt,
    idempotencyKey,
    status: "PENDING",
    tenantId: command.tenantId,
    branchId: command.branchId,
  };

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
    updatedAt: new Date().toISOString(),
  };

  const prod = db.products.get(command.productId) as any;
  let updatedProd: any = null;
  if (prod) {
    const siblingVariants = Array.from(db.productVariants.values()).filter((v: any) => v.productId === command.productId);
    const sumStock = siblingVariants.length > 0
      ? siblingVariants.reduce((sum: number, v: any) => {
          if (v.id === command.variantId) return sum + quantityAfter;
          return sum + Number(v.inventoryQuantity ?? v.stock ?? 0);
        }, 0)
      : Math.max(0, Number(prod.totalStock ?? prod.stock ?? 0) + delta);

    updatedProd = {
      ...prod,
      availableStock: sumStock,
      totalStock: sumStock,
      stock: sumStock,
      updatedAt: new Date().toISOString(),
    };
  }

  await db.executeAtomicMutation({
    writes: [
      { store: "stockLedger", key: ledgerId, value: ledger },
      { store: "stockAdjustments", key: adjustmentId, value: adjustment },
      { store: "productVariants", key: updatedVariant.id, value: updatedVariant },
      ...(updatedProd ? [{ store: "products" as const, key: command.productId, value: updatedProd }] : []),
    ],
    outboxItem: outbox,
    tenantContext: { tenantId: command.tenantId, branchId: command.branchId },
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { productId: command.productId, variantId: command.variantId, quantityAfter } }));
    publishDataChanged({ action: "INVENTORY_CHANGED" });
    window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { operationId, entityType: "StockAdjustment" } }));
  }

  return { adjustmentId, ledgerId, operationId, idempotencyKey, quantityBefore, quantityAfter };
}

/**
 * Adds stock to a specific product variant, materializing it across
 * db.stockLedger, db.productVariants, db.products, and the sync outbox.
 */
export async function queueAddStock(
  db: LocalIndexedDbStore,
  command: AddStockCommand,
): Promise<QueuedStockMovement> {
  return queueStockAdjustment(db, {
    tenantId: command.tenantId,
    branchId: command.branchId,
    productId: command.productId,
    variantId: command.variantId,
    sku: command.sku,
    productName: command.productName,
    adjustmentType: "INCREASE",
    quantity: command.quantity,
    unitCost: command.unitCost,
    reason: command.reason,
    notes: command.notes,
    movementType: command.movementType === "OPENING_STOCK" ? "OPENING_STOCK" : "ADJUSTMENT_GAIN",
    userId: command.userId,
    deviceId: command.deviceId,
    occurredAt: command.occurredAt,
  });
}

/**
 * Records stock deductions for a completed POS checkout across variants,
 * products, and ledger, keeping POS and Inventory 100% in sync.
 */
export async function recordPosSaleDeductions(
  db: LocalIndexedDbStore,
  params: PosSaleStockParams,
): Promise<void> {
  const { saleId, items, tenantId, branchId, userId, deviceId } = params;
  const occurredAt = new Date().toISOString();

  for (const item of items) {
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const prod = db.products.get(item.productId) as any;
    if (!prod || (prod.tenantId && prod.tenantId !== tenantId) || (prod.branchId && prod.branchId !== branchId)) {
      throw new Error(`INVENTORY_PRODUCT_NOT_FOUND_OR_OUT_OF_SCOPE:${item.productId}`);
    }

    const targetVariant = item.variantId
      ? (db.productVariants.get(item.variantId) as any)
      : [...db.productVariants.values()].find(
          (v: any) => v.productId === prod.id && v.tenantId === tenantId && v.branchId === branchId,
        ) as any;

    if (!targetVariant || targetVariant.tenantId !== tenantId || targetVariant.branchId !== branchId) {
      throw new Error(`INVENTORY_VARIANT_REQUIRED:${item.productId}`);
    }

    const resolvedVariantId = targetVariant.id;
    const priorLedger = [...db.stockLedger.values()].filter(
      (entry: any) =>
        entry.tenantId === tenantId &&
        entry.branchId === branchId &&
        entry.variantId === resolvedVariantId,
    );
    const quantityBefore = priorLedger.reduce(
      (sum, entry: any) => sum + Number(entry.quantityChange ?? entry.quantity ?? 0),
      0,
    );
    if (quantityBefore < qty) {
      throw new Error(`INSUFFICIENT_LOCAL_STOCK:${resolvedVariantId}`);
    }

    const quantityAfter = quantityBefore - qty;
    const unitCost = Number(item.unitCost ?? targetVariant.costPrice ?? prod.costPrice ?? prod.buyingPrice ?? 0);
    const ledgerId = `led-${saleId}-${resolvedVariantId}`;
    const adjustmentId = `adj-sale-${saleId}-${resolvedVariantId}`;
    const operationId = `sale-stock-${saleId}-${resolvedVariantId}`;
    const idempotencyKey = `SALE-STOCK-${saleId}-${resolvedVariantId}`;

    const existingLedger = [...db.stockLedger.values()].find(
      (entry: any) =>
        entry.tenantId === tenantId &&
        entry.branchId === branchId &&
        entry.idempotencyKey === idempotencyKey,
    );
    if (existingLedger) continue;

    const ledgerRecord: StockLedger = {
      id: ledgerId,
      tenantId,
      branchId,
      productId: prod.id,
      variantId: resolvedVariantId,
      movementType: "SALE",
      referenceType: "SALE",
      referenceId: saleId,
      quantityBefore,
      quantityChange: -qty,
      quantity: -qty,
      quantityAfter,
      unitCost,
      totalCost: qty * unitCost,
      userId: userId || undefined,
      deviceId: deviceId || "pos-terminal",
      operationId,
      idempotencyKey,
      notes: `POS Sale ${saleId}`,
      synced: false,
      occurredAt,
      createdAt: occurredAt,
    };

    const updatedVariant = {
      ...targetVariant,
      inventoryQuantity: quantityAfter,
      stock: quantityAfter,
      tenantId,
      branchId,
      updatedAt: occurredAt,
    };

    const siblingVariants = [...db.productVariants.values()].filter(
      (v: any) => v.productId === prod.id && v.tenantId === tenantId && v.branchId === branchId,
    );
    const productAfter = siblingVariants.reduce(
      (sum: number, v: any) => sum + (v.id === resolvedVariantId ? quantityAfter : Number(v.inventoryQuantity ?? v.stock ?? 0)),
      0,
    );
    const updatedProduct = {
      ...prod,
      tenantId,
      branchId,
      totalStock: Math.max(0, productAfter),
      availableStock: Math.max(0, productAfter),
      stock: Math.max(0, productAfter),
      updatedAt: occurredAt,
    };

    const adjustmentRecord: any = {
      id: adjustmentId,
      tenantId,
      branchId,
      productId: prod.id,
      variantId: resolvedVariantId,
      sku: targetVariant.sku || prod.sku,
      adjustmentType: "DECREASE",
      quantityChange: -qty,
      change: -qty,
      reason: `POS Sale ${saleId}`,
      status: "PENDING",
      deviceId: deviceId || "pos-terminal",
      operationId,
      idempotencyKey,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };

    const outboxItem: OutboxItem = {
      id: operationId,
      entityType: "StockAdjustment",
      entityId: adjustmentId,
      operationType: "CREATE",
      payload: {
        id: adjustmentId,
        productId: prod.id,
        variantId: resolvedVariantId,
        adjustmentType: "DECREASE",
        movementType: "SALE",
        quantityChange: -qty,
        quantity: qty,
        reason: `POS Sale ${saleId}`,
        deviceId: deviceId || "pos-terminal",
        operationId,
        idempotencyKey,
        ledgerId,
        referenceType: "SALE",
        referenceId: saleId,
        unitCost,
        quantityBefore,
        quantityAfter,
        occurredAt,
      },
      clientCreatedAt: occurredAt,
      idempotencyKey,
      status: "PENDING",
      tenantId,
      branchId,
    };

    await db.executeAtomicMutation({
      writes: [
        { store: "stockLedger", key: ledgerId, value: ledgerRecord },
        { store: "productVariants", key: resolvedVariantId, value: updatedVariant },
        { store: "products", key: prod.id, value: updatedProduct },
        { store: "stockAdjustments", key: adjustmentId, value: adjustmentRecord },
      ],
      outboxItem,
      tenantContext: { tenantId, branchId },
    });
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { saleId, items } }));
    publishDataChanged({ action: "INVENTORY_CHANGED" });
  }
}

/**
 * Records restocked inventory for customer returns/refunds.
 */
export async function recordPosSaleRefundRestock(
  db: LocalIndexedDbStore,
  params: PosRefundStockParams,
): Promise<void> {
  const { saleId, items, tenantId, branchId, userId, deviceId } = params;
  const occurredAt = new Date().toISOString();
  const ctx = { tenantId, branchId };
  for (const item of items) {
    const returnedQty = Number(item.qty);
    if (!Number.isFinite(returnedQty) || returnedQty <= 0) continue;
    let prod = db.products.get(item.productId) as any;
    if (!prod) for (const p of db.products.values()) if (p.id === item.productId || (item.sku && p.sku === item.sku)) { prod = p; break; }
    if (!prod) continue;
    let targetVariant: any = item.variantId ? db.productVariants.get(item.variantId) : null;
    if (!targetVariant) for (const v of db.productVariants.values()) if (v.productId === prod.id && (!item.variantId || v.id === item.variantId)) { targetVariant = v; break; }
    const resolvedVariantId = targetVariant?.id || item.variantId || `${prod.id}-default`;
    const priorLedger = [...db.stockLedger.values()].filter((entry: any) => entry.tenantId === tenantId && entry.branchId === branchId && entry.variantId === resolvedVariantId);
    const quantityBefore = priorLedger.reduce((sum, entry: any) => sum + Number(entry.quantityChange ?? entry.quantity ?? 0), 0);
    const quantityAfter = quantityBefore + returnedQty;
    const variant = targetVariant || { id: resolvedVariantId, productId: prod.id, name: "Standard", sku: `${prod.sku || prod.id}-STD`, price: Number(prod.sellingPrice || prod.price || 0), costPrice: Number(prod.buyingPrice || prod.costPrice || 0), isActive: true };
    const updatedVariant = { ...variant, tenantId, branchId, inventoryQuantity: quantityAfter, stock: quantityAfter, updatedAt: occurredAt };
    const productLedger = [...db.stockLedger.values()].filter((entry: any) => entry.tenantId === tenantId && entry.branchId === branchId && entry.productId === prod.id);
    const productBefore = productLedger.reduce((sum, entry: any) => sum + Number(entry.quantityChange ?? entry.quantity ?? 0), 0);
    const updatedProd = { ...prod, tenantId, branchId, availableStock: productBefore + returnedQty, totalStock: productBefore + returnedQty, stock: productBefore + returnedQty, updatedAt: occurredAt };
    const unitCost = Number(item.unitCost || prod.costPrice || prod.buyingPrice || 0);
    const ledgerId = `led-refund-${saleId}-${resolvedVariantId}`;
    const adjustmentId = `adj-refund-${saleId}-${resolvedVariantId}`;
    const ledgerRecord: StockLedger = { id: ledgerId, tenantId, branchId, productId: prod.id, variantId: resolvedVariantId, movementType: "CUSTOMER_RETURN", referenceType: "RETURN", referenceId: saleId, quantityBefore, quantityChange: returnedQty, quantity: returnedQty, quantityAfter, unitCost, totalCost: returnedQty * unitCost, userId: userId || undefined, deviceId: deviceId || "pos-terminal", operationId: `refund-stock-${saleId}-${resolvedVariantId}`, idempotencyKey: `REFUND-STOCK-${saleId}-${resolvedVariantId}`, notes: `POS Refund Restock for Sale ${saleId}`, synced: false, occurredAt, createdAt: occurredAt };
    const adjustmentRecord: any = { id: adjustmentId, tenantId, branchId, productId: prod.id, variantId: resolvedVariantId, sku: updatedVariant.sku || prod.sku, adjustmentType: "INCREASE", quantityChange: returnedQty, change: returnedQty, reason: `POS Refund Restock for Sale ${saleId}`, status: "PENDING", deviceId: deviceId || "pos-terminal", operationId: adjustmentId, idempotencyKey: `ADJ-REFUND-${saleId}-${resolvedVariantId}`, createdAt: occurredAt, updatedAt: occurredAt };
    const outboxItem: OutboxItem = { id: adjustmentId, entityType: "StockAdjustment", entityId: adjustmentId, operationType: "CREATE", payload: { ...adjustmentRecord, ledgerId, unitCost, quantityBefore, quantityAfter, idempotencyKey: adjustmentRecord.idempotencyKey }, clientCreatedAt: occurredAt, idempotencyKey: adjustmentRecord.idempotencyKey, status: "PENDING", tenantId, branchId };
    await db.executeAtomicMutation({ writes: [ { store: "productVariants", key: resolvedVariantId, value: updatedVariant }, { store: "products", key: prod.id, value: updatedProd }, { store: "stockLedger", key: ledgerId, value: ledgerRecord }, { store: "stockAdjustments", key: adjustmentId, value: adjustmentRecord } ], outboxItem, tenantContext: ctx });
  }
  if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { saleId, items } })); publishDataChanged({ action: "INVENTORY_CHANGED" }); }
}
