import { randomUUID } from "node:crypto";
import { calculateAuthoritativeStock, projectProductBranchStock, projectProductStockSummary, projectVariantInventory } from "@kwakopos2/database";
import type { TenantContext, SyncPushRequest } from "@kwakopos2/contracts";
import { stripSyncControlFields } from "./syncIntegrity.js";

const inventoryTypes = new Set(["StockTransfer","StockCount","ProductBundle","WastageRecord","ProductPriceHistory"]);

export function isInventoryProductionLockEntity(entityType: string): boolean {
  return inventoryTypes.has(entityType);
}

export async function applyInventoryProductionLockOperation(
  ctx: TenantContext,
  req: SyncPushRequest,
  op: SyncPushRequest["operations"][number],
  tx: any,
  recordPriceChange: (ctx: TenantContext, req: any, db?: any) => Promise<any>,
): Promise<boolean> {
  if (!isInventoryProductionLockEntity(op.entityType)) return false;
  const payload: any = stripSyncControlFields(op.payload as any);
  const now = new Date();

  if (op.entityType === "ProductPriceHistory" && op.operationType === "CREATE") {
    const result = await recordPriceChange(ctx, {
      id: op.entityId,
      productId: String(payload.productId || ""),
      variantId: payload.variantId || undefined,
      newBuyingPrice: Number(payload.newBuyingPrice),
      newSellingPrice: Number(payload.newSellingPrice),
      changeType: payload.changeType || "MANUAL_ADJUSTMENT",
      changeReason: String(payload.changeReason || "Price version committed"),
      effectiveFrom: payload.effectiveFrom || now.toISOString(),
      deviceId: req.deviceId,
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
    }, tx);
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_PRICE_VERSION_COMMITTED", entityType: "ProductPriceHistory", entityId: String(result.id),
      metadata: { operationId: op.operationId, changeReason: payload.changeReason || null },
    }});
    return true;
  }

  if (op.entityType === "StockTransfer" && op.operationType === "CREATE") {
    if (ctx.branchId !== String(payload.sourceBranchId || "")) throw new Error("TRANSFER_SOURCE_BRANCH_FORBIDDEN");
    const destinationBranchId = String(payload.destinationBranchId || "");
    if (!destinationBranchId || destinationBranchId === ctx.branchId) throw new Error("TRANSFER_DESTINATION_BRANCH_INVALID");
    const destination = await tx.branch.findFirst({ where: { id: destinationBranchId, tenantId: ctx.tenantId } });
    if (!destination) throw new Error("TRANSFER_DESTINATION_BRANCH_NOT_FOUND");
    const existing = await tx.stockTransfer.findUnique({ where: { id: op.entityId }, include: { items: true } });
    if (existing) {
      if (existing.tenantId !== ctx.tenantId || existing.sourceBranchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      return true;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("TRANSFER_ITEMS_REQUIRED");
    const transferNumber = String(payload.transferNumber || `TRF-${Date.now().toString(36).toUpperCase()}`);
    await tx.stockTransfer.create({ data: {
      id: op.entityId, tenantId: ctx.tenantId, sourceBranchId: ctx.branchId, destinationBranchId,
      transferNumber, status: "SUBMITTED", notes: payload.notes ?? null, requestedById: ctx.userId,
      submittedAt: now, idempotencyKey: op.idempotencyKey,
      items: { create: [] },
    }});
    for (const item of items) {
      const variant = await tx.productVariant.findFirst({ where: { id: item.variantId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!variant) throw new Error("TRANSFER_VARIANT_BOUNDARY_VIOLATION");
      const qty = Number(item.quantity);
      if (!(qty > 0)) throw new Error("TRANSFER_QUANTITY_INVALID");
      const current = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, variant.id);
      if (current < qty) throw new Error(`INSUFFICIENT_STOCK_FOR_TRANSFER:${variant.id}`);
      await tx.stockTransferItem.create({ data: {
        id: String(item.id || randomUUID()), transferId: op.entityId, productId: variant.productId, variantId: variant.id,
        quantity: qty, unitCost: Number(item.unitCost ?? variant.costPrice ?? 0),
      }});
      const unitCost = Number(item.unitCost ?? variant.costPrice ?? 0);
      await tx.stockLedger.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
        movementType: "TRANSFER_OUT", quantityChange: -qty, quantity: -qty, quantityBefore: current, quantityAfter: current - qty,
        unitCost, totalCost: qty * unitCost, referenceType: "StockTransfer", referenceId: op.entityId,
        occurredAt: now, deviceId: req.deviceId, operationId: `${op.operationId}:out:${variant.id}`,
        idempotencyKey: `${op.idempotencyKey}:out:${variant.id}`, notes: `Transfer ${transferNumber} to branch ${destinationBranchId}`,
      }});
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, variant.id);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, variant.id, null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
    }
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_TRANSFER_SUBMITTED", entityType: "StockTransfer", entityId: op.entityId,
      metadata: { destinationBranchId, itemCount: items.length, operationId: op.operationId },
    }});
    return true;
  }

  if (op.entityType === "StockTransfer" && op.operationType === "UPDATE") {
    const existing = await tx.stockTransfer.findUnique({ where: { id: op.entityId }, include: { items: true } });
    if (!existing || existing.tenantId !== ctx.tenantId) throw new Error("TRANSFER_NOT_FOUND");
    if (existing.destinationBranchId !== ctx.branchId) throw new Error("TRANSFER_DESTINATION_BRANCH_FORBIDDEN");
    if (String(payload.status || "").toUpperCase() !== "RECEIVED") throw new Error("TRANSFER_INVALID_TRANSITION");
    if (existing.status === "RECEIVED") return true;
    if (existing.status !== "SUBMITTED") throw new Error("TRANSFER_INVALID_STATE");
    for (const item of existing.items) {
      const sourceVariant = await tx.productVariant.findFirst({ where: { id: item.variantId, tenantId: ctx.tenantId, branchId: existing.sourceBranchId } });
      if (!sourceVariant) throw new Error("TRANSFER_SOURCE_VARIANT_NOT_FOUND");
      const variant = await tx.productVariant.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, sku: sourceVariant.sku },
      });
      if (!variant) throw new Error("TRANSFER_RECEIVE_VARIANT_NOT_FOUND");
      const current = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, variant.id);
      const qty = Number(item.quantity);
      const unitCost = Number(item.unitCost || 0);
      await tx.stockLedger.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
        movementType: "TRANSFER_IN", quantityChange: qty, quantity: qty, quantityBefore: current, quantityAfter: current + qty,
        unitCost, totalCost: qty * unitCost, referenceType: "StockTransfer", referenceId: op.entityId, occurredAt: now,
        deviceId: req.deviceId, operationId: `${op.operationId}:in:${variant.id}`, idempotencyKey: `${op.idempotencyKey}:in:${variant.id}`,
        notes: `Received transfer ${existing.transferNumber}`,
      }});
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, variant.id);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, variant.id, null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
    }
    await tx.stockTransfer.update({ where: { id: op.entityId }, data: { status: "RECEIVED", receivedAt: now, receivedById: ctx.userId } });
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_TRANSFER_RECEIVED", entityType: "StockTransfer", entityId: op.entityId,
      metadata: { sourceBranchId: existing.sourceBranchId, operationId: op.operationId },
    }});
    return true;
  }

  if (op.entityType === "StockCount" && op.operationType === "CREATE") {
    const existing = await tx.stockCount.findUnique({ where: { id: op.entityId } });
    if (existing) {
      if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      return true;
    }
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!lines.length) throw new Error("STOCK_COUNT_LINES_REQUIRED");
    await tx.stockCount.create({ data: {
      id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId,
      sessionNumber: String(payload.sessionNumber || `COUNT-${Date.now().toString(36).toUpperCase()}`),
      name: String(payload.name || "Physical Stock Count"), scope: String(payload.scope || "FULL_STORE"),
      status: "COUNTING", categoryId: payload.categoryId || null, locationId: payload.locationId || null,
      notes: payload.notes || null, startedAt: new Date(payload.startedAt || now.toISOString()),
      createdById: ctx.userId, idempotencyKey: op.idempotencyKey,
      items: { create: lines.map((line: any) => ({
        id: String(line.id || randomUUID()), productId: line.productId, variantId: line.variantId,
        sku: String(line.sku || line.variantId), productName: String(line.productName || ""),
        systemQuantity: Number(line.systemQuantity || 0),
        countedQuantity: line.countedQuantity == null ? null : Number(line.countedQuantity),
        varianceQuantity: Number(line.varianceQuantity || 0), varianceValue: Number(line.varianceValue || 0),
        unitCost: Number(line.unitCost || 0),
      }))},
    }});
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_STOCK_COUNT_STARTED", entityType: "StockCount", entityId: op.entityId,
      metadata: { operationId: op.operationId, lineCount: lines.length },
    }});
    return true;
  }

  if (op.entityType === "StockCount" && op.operationType === "UPDATE") {
    const existing = await tx.stockCount.findUnique({ where: { id: op.entityId }, include: { items: true } });
    if (!existing || existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("STOCK_COUNT_NOT_FOUND");
    if (existing.status === "POSTED") return true;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    for (const line of lines) {
      if (line.countedQuantity == null) continue;
      const row = existing.items.find((candidate: any) => candidate.id === String(line.id));
      if (!row) throw new Error("STOCK_COUNT_LINE_NOT_FOUND");
      const counted = Number(line.countedQuantity);
      const variance = Math.round((counted - Number(row.systemQuantity)) * 10000) / 10000;
      await tx.stockCountItem.update({ where: { id: row.id }, data: {
        countedQuantity: counted, varianceQuantity: variance,
        varianceValue: variance * Number(row.unitCost || 0), countedByUserId: ctx.userId, countedAt: now, notes: line.notes || null,
      }});
    }
    if (String(payload.status || "COUNTING").toUpperCase() !== "POSTED") return true;
    const countLines = await tx.stockCountItem.findMany({ where: { countId: op.entityId } });
    for (const line of countLines) {
      const variance = Number(line.varianceQuantity || 0);
      if (Math.abs(variance) <= 0.0000001 || line.postedAdjustmentId) continue;
      const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!variant) throw new Error("STOCK_COUNT_VARIANT_BOUNDARY_VIOLATION");
      const current = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, variant.id);
      const next = current + variance;
      if (next < 0) throw new Error(`NEGATIVE_STOCK_FROM_COUNT:${variant.id}`);
      const adjId = randomUUID();
      const adjustmentIdem = `${op.idempotencyKey}:adjust:${line.variantId}`;
      const existingAdjustment = await tx.stockAdjustment.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: adjustmentIdem } });
      const adjustment = existingAdjustment ?? await tx.stockAdjustment.create({ data: {
        id: adjId, tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: variant.id,
        adjustmentType: variance >= 0 ? "INCREASE" : "DECREASE", quantityChange: variance,
        reason: `PHYSICAL_COUNT:${existing.sessionNumber}`, referenceNote: existing.notes, status: "COMPLETED",
        createdByUserId: ctx.userId, deviceId: req.deviceId, operationId: `${op.operationId}:adjust:${line.variantId}`,
        idempotencyKey: adjustmentIdem,
      } });
      await tx.stockLedger.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
        movementType: variance >= 0 ? "ADJUSTMENT_GAIN" : "ADJUSTMENT_LOSS", quantityChange: variance, quantity: variance,
        quantityBefore: current, quantityAfter: next, unitCost: Number(line.unitCost || variant.costPrice || 0),
        totalCost: Math.abs(variance) * Number(line.unitCost || variant.costPrice || 0), referenceType: "StockCount",
        referenceId: op.entityId, occurredAt: now, deviceId: req.deviceId, operationId: `${op.operationId}:ledger:${line.variantId}`,
        idempotencyKey: `${adjustmentIdem}:ledger`, notes: `Stock count reconciliation ${existing.sessionNumber}`,
      }});
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, variant.id);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, variant.id, null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
      await tx.stockCountItem.update({ where: { id: line.id }, data: { postedAdjustmentId: adjustment.id }});
    }
    await tx.stockCount.update({ where: { id: op.entityId }, data: { status: "POSTED", reconciledAt: now, postedAt: now, approvedById: ctx.userId }});
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_STOCK_COUNT_POSTED", entityType: "StockCount", entityId: op.entityId,
      metadata: { operationId: op.operationId },
    }});
    return true;
  }

  if (op.entityType === "ProductBundle" && ["CREATE","UPDATE","DELETE"].includes(op.operationType)) {
    const existing = await tx.productBundle.findUnique({ where: { id: op.entityId }, include: { items: true } });
    if (op.operationType === "DELETE") {
      if (!existing) return true;
      if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      await tx.productBundle.update({ where: { id: op.entityId }, data: { status: "INACTIVE", effectiveTo: now }});
      return true;
    }
    if (existing && (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId)) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
    if (existing && payload._baseUpdatedAt && existing.updatedAt.getTime() > new Date(payload._baseUpdatedAt).getTime()) throw new Error("STALE_WRITE_CONFLICT:BUNDLE");
    if (!existing) {
      const parent = await tx.product.findFirst({ where: { id: payload.productId, tenantId: ctx.tenantId, branchId: ctx.branchId }});
      if (!parent) throw new Error("BUNDLE_PARENT_PRODUCT_BOUNDARY_VIOLATION");
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) throw new Error("BUNDLE_COMPONENTS_REQUIRED");
      await tx.productBundle.create({ data: {
        id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, productId: parent.id, name: String(payload.name || ""),
        status: payload.status || "ACTIVE", effectiveFrom: new Date(payload.effectiveFrom || now.toISOString()), effectiveTo: null,
        notes: payload.notes || null, createdById: ctx.userId, idempotencyKey: op.idempotencyKey,
        items: { create: [] },
      }});
      for (const item of items) {
        const component = await tx.productVariant.findFirst({ where: { id: item.componentVariantId, tenantId: ctx.tenantId, branchId: ctx.branchId }});
        if (!component) throw new Error("BUNDLE_COMPONENT_BOUNDARY_VIOLATION");
        const qty = Number(item.quantity);
        if (!(qty > 0)) throw new Error("BUNDLE_COMPONENT_QTY_INVALID");
        await tx.productBundleItem.create({ data: {
          id: String(item.id || randomUUID()), bundleId: op.entityId, componentProductId: component.productId,
          componentVariantId: component.id, quantity: qty,
        }});
      }
    } else {
      await tx.productBundle.update({ where: { id: op.entityId }, data: {
        name: payload.name ?? existing.name, status: payload.status ?? existing.status,
        effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : existing.effectiveTo,
        notes: payload.notes ?? existing.notes,
      }});
      if (Array.isArray(payload.items)) {
        await tx.productBundleItem.deleteMany({ where: { bundleId: op.entityId }});
        for (const item of payload.items) {
          const component = await tx.productVariant.findFirst({ where: { id: item.componentVariantId, tenantId: ctx.tenantId, branchId: ctx.branchId }});
          if (!component) throw new Error("BUNDLE_COMPONENT_BOUNDARY_VIOLATION");
          await tx.productBundleItem.create({ data: {
            id: String(item.id || randomUUID()), bundleId: op.entityId, componentProductId: component.productId,
            componentVariantId: component.id, quantity: Number(item.quantity),
          }});
        }
      }
    }
    const assembleQty = Number(payload.assembleQuantity || 0);
    if (assembleQty > 0) {
      const bundle = await tx.productBundle.findUnique({ where: { id: op.entityId }, include: { items: true }});
      if (!bundle || bundle.status !== "ACTIVE") throw new Error("BUNDLE_NOT_ACTIVE");
      const parentVariant = await tx.productVariant.findFirst({ where: { productId: bundle.productId, tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true }, orderBy: { createdAt: "asc" }});
      if (!parentVariant) throw new Error("BUNDLE_PARENT_VARIANT_NOT_FOUND");
      let componentCost = 0;
      for (const item of bundle.items) {
        const component = await tx.productVariant.findFirst({ where: { id: item.componentVariantId, tenantId: ctx.tenantId, branchId: ctx.branchId }});
        if (!component) throw new Error("BUNDLE_COMPONENT_VARIANT_NOT_FOUND");
        const consumeQty = assembleQty * Number(item.quantity);
        const current = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, component.id);
        if (current < consumeQty) throw new Error("BUNDLE_INSUFFICIENT_COMPONENT_STOCK");
        const unitCost = Number(component.costPrice || 0);
        componentCost += consumeQty * unitCost;
        await tx.stockLedger.create({ data: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: component.productId, variantId: component.id,
          movementType: "PRODUCTION_USAGE", quantityChange: -consumeQty, quantity: -consumeQty, quantityBefore: current, quantityAfter: current - consumeQty,
          unitCost, totalCost: consumeQty * unitCost, referenceType: "ProductBundle", referenceId: bundle.id,
          occurredAt: now, deviceId: req.deviceId, operationId: `${op.operationId}:component:${component.id}`,
          idempotencyKey: `${op.idempotencyKey}:component:${component.id}`,
        }});
        await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, component.id);
        await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, component.id, null);
        await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, component.productId);
      }
      const currentParent = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, parentVariant.id);
      const parentUnitCost = assembleQty > 0 ? componentCost / assembleQty : Number(parentVariant.costPrice || 0);
      await tx.stockLedger.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: parentVariant.productId, variantId: parentVariant.id,
        movementType: "PRODUCTION_OUTPUT", quantityChange: assembleQty, quantity: assembleQty, quantityBefore: currentParent, quantityAfter: currentParent + assembleQty,
        unitCost: parentUnitCost, totalCost: componentCost, referenceType: "ProductBundle", referenceId: bundle.id,
        occurredAt: now, deviceId: req.deviceId, operationId: `${op.operationId}:output`,
        idempotencyKey: `${op.idempotencyKey}:output`, notes: `Bundle assembly ${assembleQty}x ${bundle.name}`,
      }});
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, parentVariant.id);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, parentVariant.id, null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, parentVariant.productId);
      await tx.productBundle.update({ where: { id: bundle.id }, data: { lastAssemblyAt: now }});
    }
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_BUNDLE_SAVED", entityType: "ProductBundle", entityId: op.entityId,
      metadata: { operationId: op.operationId, assembleQuantity: assembleQty },
    }});
    return true;
  }

  if (op.entityType === "WastageRecord" && op.operationType === "CREATE") {
    const variantId = String(payload.variantId || "");
    const qty = Number(payload.quantity);
    if (!variantId || !(qty > 0)) throw new Error("WASTAGE_VARIANT_AND_QUANTITY_REQUIRED");
    const variant = await tx.productVariant.findFirst({ where: { id: variantId, tenantId: ctx.tenantId, branchId: ctx.branchId }});
    if (!variant) throw new Error("WASTAGE_VARIANT_BOUNDARY_VIOLATION");
    const existing = await tx.wastageRecord.findUnique({ where: { id: op.entityId }});
    if (existing) {
      if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      return true;
    }
    const current = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, variant.id);
    if (current < qty) throw new Error("WASTAGE_INSUFFICIENT_STOCK");
    const unitCost = Number(variant.costPrice || 0);
    const ledgerId = randomUUID();
    await tx.stockLedger.create({ data: {
      id: ledgerId, tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
      movementType: "WASTAGE_SPILL", quantityChange: -qty, quantity: -qty, quantityBefore: current, quantityAfter: current - qty,
      unitCost, totalCost: qty * unitCost, referenceType: "WastageRecord", referenceId: op.entityId,
      occurredAt: new Date(payload.occurredAt || now.toISOString()), deviceId: req.deviceId, operationId: op.operationId,
      idempotencyKey: `${op.idempotencyKey}:ledger`, notes: payload.notes || payload.reason,
    }});
    await tx.wastageRecord.create({ data: {
      id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
      quantity: qty, reason: String(payload.reason || "WASTAGE_SPILL"), notes: payload.notes || null,
      occurredAt: new Date(payload.occurredAt || now.toISOString()), unitCost, totalCost: qty * unitCost, ledgerId,
      status: "POSTED", createdById: ctx.userId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey,
    }});
    await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, variant.id);
    await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, variant.id, null);
    await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
    await tx.auditEvent.create({ data: {
      id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
      action: "INVENTORY_WASTAGE_POSTED", entityType: "WastageRecord", entityId: op.entityId,
      metadata: { operationId: op.operationId, quantity: qty, reason: payload.reason || "WASTAGE_SPILL", ledgerId },
    }});
    return true;
  }

  return false;
}
