import type { StockLedger, StockMovementType } from "@kwakopos2/contracts";
import type { LocalIndexedDbStore, OutboxItem } from "../indexedDb.js";
import { safeUUID } from "./apiClient.js";

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
  const priorLedger = [...db.stockLedger.values()].filter((entry: any) =>
    entry.tenantId === command.tenantId && entry.branchId === command.branchId && entry.variantId === command.variantId,
  );
  const quantityBefore = priorLedger.reduce((sum, entry: any) => sum + Number(entry.quantityChange ?? entry.quantity ?? 0), 0);
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

  await db.executeAtomicBusinessTransaction({
    targetStore: "stockLedger",
    entityId: ledgerId,
    entityData: ledger,
    outboxItem: outbox,
    tenantContext: { tenantId: command.tenantId, branchId: command.branchId },
  });

  window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { operationId, entityType: "StockAdjustment" } }));
  return { adjustmentId, ledgerId, operationId, idempotencyKey, quantityBefore, quantityAfter };
}
