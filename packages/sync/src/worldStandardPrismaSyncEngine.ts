import type { TenantContext, SyncPushRequest, SyncPushResponse, SyncDeltaRequest, SyncDeltaResponse } from "@kwakopos2/contracts";
import { PrismaProductRepository, PrismaStockRepository, PrismaAtomicCommercialFinanceService, prisma } from "@kwakopos2/database";
import { computePayloadChecksum, getBaseUpdatedAt, operationFingerprint, orderSyncOperations, stripSyncControlFields, validateSyncRequest } from "./syncIntegrity.js";

const MAX_DELTA = 500;

type JournalRow = {
  revision: bigint;
  tenant_id: string;
  branch_id: string;
  operation_id: string;
  entity_type: string;
  entity_id: string;
  operation_type: string;
  record: unknown;
  source: string;
  created_at: Date;
};

export class WorldStandardPrismaSyncEngine {
  private readonly finance: PrismaAtomicCommercialFinanceService;
  private infrastructureReady: Promise<void> | null = null;

  constructor(private readonly productRepo: PrismaProductRepository, private readonly stockRepo: PrismaStockRepository) {
    this.finance = new PrismaAtomicCommercialFinanceService(prisma);
  }

  private ensureInfrastructure(): Promise<void> {
    if (this.infrastructureReady) return this.infrastructureReady!;
    this.infrastructureReady = (async () => {
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS sync_change_revision_seq`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS sync_change_journal (revision BIGINT PRIMARY KEY DEFAULT nextval('sync_change_revision_seq'), tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation_type TEXT NOT NULL, record JSONB NOT NULL, source TEXT NOT NULL DEFAULT 'push', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sync_change_journal_scope_revision_idx ON sync_change_journal (tenant_id, branch_id, revision)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sync_change_journal_entity_idx ON sync_change_journal (tenant_id, branch_id, entity_type, entity_id, revision)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS sync_conflict_record (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, local_payload JSONB NOT NULL, remote_payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ)`);
    })();
    return this.infrastructureReady!;
  }

  private async latestRevision(): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<Array<{ revision: bigint | number | string | null }>>(
      `SELECT COALESCE(MAX(revision), 0) AS revision FROM sync_change_journal`,
    );
    return String(rows[0]?.revision ?? 0);
  }

  private async snapshot(ctx: TenantContext, op: SyncPushRequest["operations"][number], db: any = prisma): Promise<unknown> {
    try {
      switch (op.entityType) {
        case "Product": return await db.product.findUnique({ where: { id: op.entityId }, include: { variants: true } });
        case "ProductVariant": return await db.productVariant.findUnique({ where: { id: op.entityId } });
        case "StockAdjustment": return await db.stockAdjustment.findUnique({ where: { id: op.entityId } });
        case "StockLedger": return await db.stockLedger.findUnique({ where: { id: op.entityId } });
        case "Customer": return await db.customer.findUnique({ where: { id: op.entityId } });
        case "Supplier": return await db.supplier.findUnique({ where: { id: op.entityId } });
        case "Category": return await db.category.findUnique({ where: { id: op.entityId } });
        case "Brand": return await db.brand.findUnique({ where: { id: op.entityId } });
        case "Sale": return await db.sale.findUnique({ where: { id: op.entityId }, include: { lines: true, payments: true } });
        case "PurchaseReceipt": return await db.purchaseReceipt.findUnique({ where: { id: op.entityId }, include: { items: true } });
        default: return op.payload;
      }
    } catch {
      return op.payload;
    }
  }

  private async journal(ctx: TenantContext, op: SyncPushRequest["operations"][number], record: unknown, source = "push", db: any = prisma): Promise<string> {
    const existing = await db.$queryRawUnsafe(
      `SELECT revision, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source, created_at
       FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2 AND operation_id = $3 LIMIT 1`,
      ctx.tenantId, ctx.branchId, op.operationId,
    );
    if ((existing as JournalRow[])[0]) return String((existing as JournalRow[])[0].revision);
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO sync_change_journal
        (tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING revision`,
      ctx.tenantId, ctx.branchId, op.operationId, op.entityType, op.entityId, op.operationType,
      JSON.stringify(record ?? op.payload), source,
    );
    return String((rows as Array<{ revision: bigint }>)[0].revision);
  }

  private async reconcileJournal(ctx: TenantContext): Promise<void> {
    await this.ensureInfrastructure();
    const rows = await prisma.$queryRawUnsafe<Array<{ operationId: string; entityType: string; entityId: string; operationType: string; payload: unknown }>>(
      `SELECT so."operationId" AS "operationId", so."entityType" AS "entityType", so."entityId" AS "entityId",
              so."operationType" AS "operationType", so.payload
         FROM sync_operations so
        WHERE so."tenantId" = $1 AND so."branchId" = $2 AND so.status = 'PROCESSED'
          AND NOT EXISTS (SELECT 1 FROM sync_change_journal cj WHERE cj.operation_id = so."operationId")
        ORDER BY so."createdAt" ASC LIMIT 1000`,
      ctx.tenantId, ctx.branchId,
    );
    for (const row of rows) {
      await this.journal(ctx, {
        operationId: row.operationId,
        entityType: row.entityType as any,
        entityId: row.entityId,
        operationType: row.operationType as any,
        payload: { ...(row.payload as any), __syncRecoveryPatch: true },
        clientCreatedAt: new Date(0).toISOString(),
        idempotencyKey: row.operationId,
      } as any, row.payload, "recovery");
    }
  }

  private async applyOperationInTransaction(ctx: TenantContext, req: SyncPushRequest, op: SyncPushRequest["operations"][number], tx: any): Promise<void> {
    if (op.entityType === "Category" && ["CREATE", "UPDATE", "DELETE"].includes(op.operationType)) {
      const payload: any = stripSyncControlFields(op.payload as any);
      const existing = await tx.category.findUnique({ where: { id: op.entityId } });
      if (op.operationType === "CREATE") {
        if (existing) {
          if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
          return;
        }
        if (payload.parentId) {
          const parent = await tx.category.findUnique({ where: { id: payload.parentId } });
          if (!parent || parent.tenantId !== ctx.tenantId || parent.branchId !== ctx.branchId || !parent.isActive) throw new Error("Parent category belongs to another tenant/branch or is inactive");
        }
        await tx.category.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, name: String(payload.name || "").trim(), code: String(payload.code || payload.name || "").trim().toUpperCase(), parentId: payload.parentId ?? null, description: payload.description?.trim() || null, color: payload.color?.trim() || null, isActive: payload.isActive !== false } });
        return;
      }
      if (!existing) { if (op.operationType === "DELETE") return; throw new Error("Category not found"); }
      if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      const base = getBaseUpdatedAt(op.payload);
      if (base && existing.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: category changed on server");
      if (op.operationType === "DELETE") {
        const replacementId = payload.replacementId;
        const count = await tx.product.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: op.entityId, isActive: true } });
        if (count > 0 && !replacementId) throw new Error("Category has assigned products; replacementId is required");
        if (replacementId) {
          if (replacementId === op.entityId) throw new Error("Replacement category must differ from deleted category");
          const replacement = await tx.category.findUnique({ where: { id: replacementId } });
          if (!replacement || replacement.tenantId !== ctx.tenantId || replacement.branchId !== ctx.branchId || !replacement.isActive) throw new Error("Replacement category is invalid");
          await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: op.entityId }, data: { categoryId: replacementId, category: replacement.name } });
        }
        await tx.category.update({ where: { id: op.entityId }, data: { isActive: false } });
        return;
      }
      if (payload.parentId === op.entityId) throw new Error("Category cannot be its own parent");
      if (payload.parentId) {
        const parent = await tx.category.findUnique({ where: { id: payload.parentId } });
        if (!parent || parent.tenantId !== ctx.tenantId || parent.branchId !== ctx.branchId || !parent.isActive) throw new Error("Parent category belongs to another tenant/branch or is inactive");
      }
      const name = payload.name === undefined ? undefined : String(payload.name).trim();
      await tx.category.update({ where: { id: op.entityId }, data: { name, code: payload.code === undefined ? undefined : String(payload.code).trim().toUpperCase(), parentId: payload.parentId !== undefined ? payload.parentId : undefined, description: payload.description !== undefined ? (String(payload.description).trim() || null) : undefined, color: payload.color !== undefined ? (String(payload.color).trim() || null) : undefined, isActive: payload.isActive } });
      if (name !== undefined && name !== existing.name) await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: op.entityId }, data: { category: name } });
      return;
    }

    if (op.entityType === "Brand" && ["CREATE", "UPDATE", "DELETE"].includes(op.operationType)) {
      const payload: any = stripSyncControlFields(op.payload as any);
      const existing = await tx.brand.findUnique({ where: { id: op.entityId } });
      if (op.operationType === "CREATE") {
        if (existing) {
          if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
          return;
        }
        await tx.brand.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, name: String(payload.name || "").trim(), code: String(payload.code || payload.name || "").trim().toUpperCase(), origin: payload.origin?.trim() || null, notes: payload.notes?.trim() || null, isActive: payload.isActive !== false } });
        return;
      }
      if (!existing) { if (op.operationType === "DELETE") return; throw new Error("Brand not found"); }
      if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      const base = getBaseUpdatedAt(op.payload);
      if (base && existing.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: brand changed on server");
      if (op.operationType === "DELETE") {
        const replacementId = payload.replacementId;
        const count = await tx.product.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, brandId: op.entityId, isActive: true } });
        if (count > 0 && !replacementId) throw new Error("Brand has assigned products; replacementId is required");
        if (replacementId) {
          if (replacementId === op.entityId) throw new Error("Replacement brand must differ from deleted brand");
          const replacement = await tx.brand.findUnique({ where: { id: replacementId } });
          if (!replacement || replacement.tenantId !== ctx.tenantId || replacement.branchId !== ctx.branchId || !replacement.isActive) throw new Error("Replacement brand is invalid");
          await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, brandId: op.entityId }, data: { brandId: replacementId } });
        }
        await tx.brand.update({ where: { id: op.entityId }, data: { isActive: false } });
        return;
      }
      await tx.brand.update({ where: { id: op.entityId }, data: { name: payload.name?.trim(), code: payload.code?.trim().toUpperCase(), origin: payload.origin !== undefined ? (payload.origin.trim() || null) : undefined, notes: payload.notes !== undefined ? (payload.notes.trim() || null) : undefined, isActive: payload.isActive } });
      return;
    }

    if (op.entityType === "Product" && op.operationType === "CREATE") {
      const payload = op.payload as any;
      const existing = await tx.product.findUnique({ where: { id: op.entityId } });
      if (!existing) {
        await tx.product.create({
          data: {
            id: op.entityId,
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            name: payload.name,
            description: payload.description ?? null,
            sku: payload.sku,
            category: payload.category ?? "General",
            isActive: payload.isActive ?? true,
            variants: {
              create: (payload.variants || []).map((v: any) => ({
                id: v.id,
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                name: v.name,
                sku: v.sku,
                barcode: v.barcode ?? null,
                price: v.price,
                costPrice: v.costPrice,
                isActive: v.isActive ?? true,
              })),
            },
          },
        });
      }
      return;
    }

    if (op.entityType === "Product" && op.operationType === "UPDATE") {
      const current = await tx.product.findUnique({ where: { id: op.entityId } });
      const base = getBaseUpdatedAt(op.payload);
      if (!current) throw new Error(`Product ${op.entityId} not found`);
      if (current.tenantId !== ctx.tenantId || current.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      if (base && current.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: product changed on server");
      const payload = stripSyncControlFields(op.payload as any);
      await tx.product.update({ where: { id: op.entityId }, data: { name: payload.name, description: payload.description, sku: payload.sku, category: payload.category, isActive: payload.isActive } });
      return;
    }

    if (op.entityType === "ProductVariant" && op.operationType === "CREATE") {
      const payload = op.payload as any;
      const product = await tx.product.findUnique({ where: { id: payload.productId } });
      if (!product) throw new Error(`Product ${payload.productId} not found`);
      if (product.tenantId !== ctx.tenantId || product.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      const existing = await tx.productVariant.findUnique({ where: { id: op.entityId } });
      if (!existing) {
        await tx.productVariant.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, productId: payload.productId, name: payload.name, sku: payload.sku, barcode: payload.barcode ?? null, price: payload.price, costPrice: payload.costPrice, isActive: payload.isActive ?? true } });
      }
      return;
    }

    if (op.entityType === "ProductVariant" && ["UPDATE", "DELETE"].includes(op.operationType)) {
      const current = await tx.productVariant.findUnique({ where: { id: op.entityId } });
      const base = getBaseUpdatedAt(op.payload);
      if (!current) {
        if (op.operationType === "DELETE") return;
        throw new Error(`Variant ${op.entityId} not found`);
      }
      if (current.tenantId !== ctx.tenantId || current.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      if (base && current.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: variant changed on server");
      if (op.operationType === "DELETE") {
        await tx.productVariant.update({ where: { id: op.entityId }, data: { isActive: false } });
      } else {
        const payload = stripSyncControlFields(op.payload as any);
        await tx.productVariant.update({ where: { id: op.entityId }, data: { name: payload.name, sku: payload.sku, barcode: payload.barcode, price: payload.price, costPrice: payload.costPrice, isActive: payload.isActive } });
      }
      return;
    }

    if (op.entityType === "Customer" && ["UPDATE", "DELETE"].includes(op.operationType)) {
      const current = await tx.customer.findUnique({ where: { id: op.entityId } });
      if (!current) { if (op.operationType === "DELETE") return; throw new Error("Customer not found"); }
      if (current.tenantId !== ctx.tenantId || current.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      const base = getBaseUpdatedAt(op.payload);
      if (base && current.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: customer changed on server");
      const payload: any = stripSyncControlFields(op.payload as any);
      await tx.customer.update({ where: { id: op.entityId }, data: op.operationType === "DELETE" ? { status: "INACTIVE" } : { customerCode: payload.customerCode, name: payload.name, phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null, creditLimit: payload.creditLimit ?? undefined, openingBalance: payload.openingBalance ?? undefined, status: payload.status ?? "ACTIVE" } });
      return;
    }

    if (op.entityType === "Supplier" && ["UPDATE", "DELETE"].includes(op.operationType)) {
      const current = await tx.supplier.findUnique({ where: { id: op.entityId } });
      if (!current) { if (op.operationType === "DELETE") return; throw new Error("Supplier not found"); }
      if (current.tenantId !== ctx.tenantId || current.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      const base = getBaseUpdatedAt(op.payload);
      if (base && current.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: supplier changed on server");
      const payload: any = stripSyncControlFields(op.payload as any);
      await tx.supplier.update({ where: { id: op.entityId }, data: op.operationType === "DELETE" ? { status: "INACTIVE" } : { supplierCode: payload.supplierCode, name: payload.name, phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null, creditLimit: payload.creditLimit ?? undefined, openingBalance: payload.openingBalance ?? undefined, status: payload.status ?? "ACTIVE" } });
      return;
    }

    if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") {
      const payload = op.payload as any;
      const existing = await tx.stockAdjustment.findUnique({ where: { idempotencyKey: op.idempotencyKey } });
      if (existing) return;
      const variant = await tx.productVariant.findUnique({ where: { id: payload.variantId } });
      if (!variant || variant.tenantId !== ctx.tenantId || variant.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      let changeQty = Number(payload.quantityChange ?? 0);
      if (payload.adjustmentType === "DECREASE") changeQty = -Math.abs(changeQty);
      if (payload.adjustmentType === "SET") {
        const ledger = await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: payload.variantId } });
        const currentStock = ledger.reduce((sum: number, row: any) => sum + Number(row.quantityChange ?? row.quantity ?? 0), 0);
        changeQty = Number(payload.quantityChange) - currentStock;
      }
      const adjustment = await tx.stockAdjustment.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: payload.variantId, adjustmentType: payload.adjustmentType, quantityChange: changeQty, reason: payload.reason, referenceNote: payload.referenceNote ?? null, status: "COMPLETED", createdByUserId: ctx.userId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey } });
      await tx.stockLedger.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: payload.variantId, movementType: "ADJUSTMENT", quantityChange: changeQty, quantity: changeQty, referenceType: "StockAdjustment", referenceId: adjustment.id, occurredAt: new Date(), deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey } });

      // Keep productVariant.inventoryQuantity consistent with ledger
      const currentVariantQty = Number(variant.inventoryQuantity ?? 0);
      const nextVariantQty = Math.max(0, currentVariantQty + changeQty);
      await tx.productVariant.update({
        where: { id: payload.variantId },
        data: { inventoryQuantity: nextVariantQty },
      });

      // Recalculate parent product available and total stock
      const siblingVars = await tx.productVariant.findMany({
        where: { productId: variant.productId, tenantId: ctx.tenantId, branchId: ctx.branchId },
      });
      const totalStock = siblingVars
        .filter((v: any) => v.isActive)
        .reduce((sum: number, v: any) => sum + (v.id === payload.variantId ? nextVariantQty : Number(v.inventoryQuantity ?? 0)), 0);
      const reservedStock = siblingVars
        .filter((v: any) => v.isActive)
        .reduce((sum: number, v: any) => sum + Number(v.reservedQuantity || 0), 0);

      await tx.product.update({
        where: { id: variant.productId },
        data: {
          totalStock,
          reservedStock,
          availableStock: Math.max(0, totalStock - reservedStock),
          lowStockVariantsCount: siblingVars.filter((v: any) => v.isActive && (v.id === payload.variantId ? nextVariantQty : Number(v.inventoryQuantity ?? 0)) <= Number(v.reorderLevel || 0)).length,
        },
      });
      return;
    }

    if (op.entityType === "UnitConversionTransaction" && op.operationType === "CREATE") {
      const payload = op.payload as any;
      const parentVariant = await tx.productVariant.findUnique({ where: { id: payload.parentVariantId } });
      if (!parentVariant || parentVariant.tenantId !== ctx.tenantId || parentVariant.branchId !== ctx.branchId) {
        throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      }
      const childVariant = await tx.productVariant.findUnique({ where: { id: payload.childVariantId } });
      if (!childVariant || childVariant.tenantId !== ctx.tenantId || childVariant.branchId !== ctx.branchId) {
        throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      }

      const parentUnitsDeducted = Number(payload.parentUnitsDeducted);
      const childUnitsProduced = Number(payload.childUnitsProduced);
      const parentCurrentQty = Number(parentVariant.inventoryQuantity ?? 0);

      if (parentCurrentQty < parentUnitsDeducted) {
        const conflictId = `conflict:conversion:${op.operationId}`;
        try {
          await tx.$executeRawUnsafe(
            `INSERT INTO sync_conflict_record (id, tenant_id, branch_id, operation_id, entity_type, entity_id, local_payload, remote_payload, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'OPEN')
             ON CONFLICT (id) DO NOTHING`,
            conflictId,
            ctx.tenantId,
            ctx.branchId,
            op.operationId,
            "UnitConversionConflict",
            payload.parentVariantId,
            JSON.stringify(payload),
            JSON.stringify({ availableParentStock: parentCurrentQty, required: parentUnitsDeducted }),
          );
        } catch {}
        throw new Error(`CONVERSION_CONFLICT: INSUFFICIENT_PARENT_STOCK (Available: ${parentCurrentQty}, Required: ${parentUnitsDeducted})`);
      }

      const parentNextQty = Math.max(0, parentCurrentQty - parentUnitsDeducted);
      const childNextQty = Number(childVariant.inventoryQuantity ?? 0) + childUnitsProduced;

      await tx.productVariant.update({
        where: { id: payload.parentVariantId },
        data: { inventoryQuantity: parentNextQty },
      });
      await tx.productVariant.update({
        where: { id: payload.childVariantId },
        data: { inventoryQuantity: childNextQty },
      });

      const now = new Date();
      await tx.stockLedger.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: parentVariant.productId,
          variantId: parentVariant.id,
          movementType: "ADJUSTMENT",
          quantityChange: -parentUnitsDeducted,
          quantity: -parentUnitsDeducted,
          quantityBefore: parentCurrentQty,
          quantityAfter: parentNextQty,
          unitCost: Number(parentVariant.costPrice || 0),
          totalCost: parentUnitsDeducted * Number(parentVariant.costPrice || 0),
          referenceType: "UNIT_CONVERSION",
          referenceId: op.entityId,
          occurredAt: now,
          deviceId: req.deviceId,
          operationId: `${op.operationId}-parent`,
          idempotencyKey: `${op.idempotencyKey}-parent`,
          notes: `Converted to child variant ${childVariant.sku} (${childUnitsProduced} units)`,
        },
      });

      await tx.stockLedger.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: childVariant.productId,
          variantId: childVariant.id,
          movementType: "ADJUSTMENT",
          quantityChange: childUnitsProduced,
          quantity: childUnitsProduced,
          quantityBefore: Number(childVariant.inventoryQuantity ?? 0),
          quantityAfter: childNextQty,
          unitCost: Number(childVariant.costPrice || 0),
          totalCost: childUnitsProduced * Number(childVariant.costPrice || 0),
          referenceType: "UNIT_CONVERSION",
          referenceId: op.entityId,
          occurredAt: now,
          deviceId: req.deviceId,
          operationId: `${op.operationId}-child`,
          idempotencyKey: `${op.idempotencyKey}-child`,
          notes: `Converted from parent variant ${parentVariant.sku} (${parentUnitsDeducted} units)`,
        },
      });
      return;
    }

    if (op.entityType === "Sale" && op.operationType === "CREATE") {
      const financeTx = new PrismaAtomicCommercialFinanceService({ $transaction: async (work: any) => work(tx) });
      await financeTx.createSale(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
      return;
    }

    if (op.entityType === "PurchaseReceipt" && op.operationType === "CREATE") {
      const financeTx = new PrismaAtomicCommercialFinanceService({ $transaction: async (work: any) => work(tx) });
      await financeTx.createPurchaseReceipt(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
      return;
    }

    if (op.entityType === "Customer" && op.operationType === "CREATE") {
      const existing = await tx.customer.findUnique({ where: { id: op.entityId } });
      if (!existing) await tx.customer.create({ data: { ...(op.payload as any), id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      return;
    }

    if (op.entityType === "Supplier" && op.operationType === "CREATE") {
      const existing = await tx.supplier.findUnique({ where: { id: op.entityId } });
      if (!existing) await tx.supplier.create({ data: { ...(op.payload as any), id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      return;
    }

    throw new Error(`Unsupported sync operation: ${op.entityType}/${op.operationType}`);
  }

  async processPush(ctx: TenantContext, req: SyncPushRequest): Promise<SyncPushResponse> {
    await this.ensureInfrastructure();
    validateSyncRequest(req);
    const results: SyncPushResponse["results"] = [];
    let processedCount = 0;
    for (const op of orderSyncOperations(req.operations)) {
      try {
        if (["Role", "User", "PlatformSecurity", "SuperAdmin"].includes(op.entityType) || JSON.stringify(op.payload || {}).includes("SUPER_ADMIN")) {
          throw new Error("PRIVILEGE_ESCALATION_ATTEMPT_DENIED: privileged entities cannot be mutated through sync.");
        }

        const outcome = await prisma.$transaction(async (tx: any) => {
          const existing = await tx.syncOperation.findFirst({
            where: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }],
            },
          });
          if (existing) {
            const fingerprint = operationFingerprint({
              operationId: existing.operationId,
              entityType: existing.entityType as any,
              entityId: existing.entityId,
              operationType: existing.operationType as any,
              payload: existing.payload as any,
              clientCreatedAt: existing.clientCreatedAt.toISOString(),
              idempotencyKey: existing.idempotencyKey,
            });
            if (fingerprint !== operationFingerprint(op)) return { status: "IDEMPOTENCY_CONFLICT" as const };
            const snapshot = await this.snapshot(ctx, op, tx);
            await this.journal(ctx, op, snapshot, "replay", tx);
            return { status: "ALREADY_PROCESSED" as const };
          }

          await this.applyOperationInTransaction(ctx, req, op, tx);
          const snapshot = await this.snapshot(ctx, op, tx);
          await tx.syncOperation.create({
            data: {
              tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: req.deviceId,
              operationId: op.operationId, entityType: op.entityType, entityId: op.entityId,
              operationType: op.operationType, payload: op.payload as any, status: "PROCESSED",
              idempotencyKey: op.idempotencyKey, clientCreatedAt: new Date(op.clientCreatedAt), processedAt: new Date(),
            },
          });
          const revision = await this.journal(ctx, op, snapshot, "push", tx);
          return { status: "SUCCESS" as const, revision };
        });

        if (outcome.status === "IDEMPOTENCY_CONFLICT") {
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_IDEMPOTENCY_CONFLICT" });
        } else if (outcome.status === "ALREADY_PROCESSED") {
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
        } else {
          processedCount += 1;
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
        }
      } catch (err: any) {
        if (String(err?.message || "").startsWith("STALE_WRITE_CONFLICT:")) {
          const conflictId = "conflict:" + op.operationId;
          const remote = await this.snapshot(ctx, op);
          await prisma.$executeRawUnsafe("INSERT INTO sync_conflict_record (id, tenant_id, branch_id, operation_id, entity_type, entity_id, local_payload, remote_payload, status) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'OPEN') ON CONFLICT (id) DO NOTHING", conflictId, ctx.tenantId, ctx.branchId, op.operationId, op.entityType, op.entityId, JSON.stringify(op.payload), JSON.stringify(remote ?? {}));
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_CONFLICT:" + conflictId });
          continue;
        }
        if (err?.code === "P2002" || err?.code === "23505") {
          const committed = await prisma.syncOperation.findFirst({
            where: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }],
            },
          });
          if (committed) {
            const snapshot = await this.snapshot(ctx, op);
            await this.journal(ctx, op, snapshot, "recovery");
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
            continue;
          }
        }
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: err?.message || "Sync operation failed" });
      }
    }
    return { processedCount, results };
  }

  async resolveConflict(ctx: TenantContext, conflictId: string, resolution: "ACCEPT_SERVER" | "ACCEPT_LOCAL" | "MERGE", mergedPayload?: Record<string, unknown>): Promise<{ status: string; operationId?: string; revision?: string }> {
    await this.ensureInfrastructure();
    return prisma.$transaction(async (tx: any) => {
      const rows = await tx.$queryRawUnsafe("SELECT id, tenant_id, branch_id, operation_id, entity_type, entity_id, local_payload, remote_payload, status FROM sync_conflict_record WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 FOR UPDATE", conflictId, ctx.tenantId, ctx.branchId);
      const conflict = rows[0];
      if (!conflict) throw new Error("SYNC_CONFLICT_NOT_FOUND");
      if (conflict.status !== "OPEN") return { status: conflict.status };
      const chosen = resolution === "ACCEPT_SERVER" ? conflict.remote_payload : resolution === "ACCEPT_LOCAL" ? conflict.local_payload : mergedPayload;
      if (!chosen || typeof chosen !== "object") throw new Error("SYNC_CONFLICT_MERGED_PAYLOAD_REQUIRED");
      const payload: any = stripSyncControlFields(chosen as Record<string, unknown>);
      const operationId = "conflict-resolution:" + conflictId;
      switch (conflict.entity_type) {
        case "Product": await tx.product.update({ where: { id: conflict.entity_id }, data: { name: payload.name, description: payload.description ?? null, sku: payload.sku, category: payload.category ?? "General", isActive: payload.isActive ?? true } }); break;
        case "ProductVariant": await tx.productVariant.update({ where: { id: conflict.entity_id }, data: { name: payload.name, sku: payload.sku, barcode: payload.barcode ?? null, price: payload.price, costPrice: payload.costPrice, isActive: payload.isActive ?? true } }); break;
        case "Customer": await tx.customer.update({ where: { id: conflict.entity_id }, data: { customerCode: payload.customerCode, name: payload.name, phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null, creditLimit: payload.creditLimit ?? undefined, openingBalance: payload.openingBalance ?? undefined, status: payload.status ?? "ACTIVE" } }); break;
        case "Supplier": await tx.supplier.update({ where: { id: conflict.entity_id }, data: { supplierCode: payload.supplierCode, name: payload.name, phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null, taxPin: payload.taxPin ?? null, status: payload.status ?? "ACTIVE" } }); break;
        default: throw new Error("SYNC_CONFLICT_RESOLUTION_UNSUPPORTED:" + conflict.entity_type);
      }
      const op: any = { operationId, entityType: conflict.entity_type, entityId: conflict.entity_id, operationType: "UPDATE", payload, clientCreatedAt: new Date().toISOString(), idempotencyKey: operationId };
      const snapshot = await this.snapshot(ctx, op, tx);
      await tx.syncOperation.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: "conflict-resolver:" + ctx.userId, operationId, entityType: conflict.entity_type, entityId: conflict.entity_id, operationType: "UPDATE", payload, status: "PROCESSED", idempotencyKey: operationId, clientCreatedAt: new Date(), processedAt: new Date() } });
      const revision = await this.journal(ctx, op, snapshot, "conflict-resolution", tx);
      await tx.$executeRawUnsafe("UPDATE sync_conflict_record SET status = $1, resolved_at = now() WHERE id = $2 AND tenant_id = $3 AND branch_id = $4", resolution, conflictId, ctx.tenantId, ctx.branchId);
      return { status: "RESOLVED", operationId, revision };
    });
  }

  async processBootstrap(ctx: TenantContext, req: any): Promise<any> {
    await this.ensureInfrastructure();
    const snapshotTimestamp = new Date().toISOString();
    const products = await this.productRepo.getProducts(ctx);
    const variants = await prisma.productVariant.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const stockLedger = await this.stockRepo.getLedger(ctx);
    const adjustments = await prisma.stockAdjustment.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const customers = await prisma.customer.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const suppliers = await prisma.supplier.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const categories = await prisma.category.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const brands = await prisma.brand.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const payload = { products, variants, stockLedger, adjustments, customers, suppliers, categories, brands };
    return { snapshotTimestamp, integrityChecksum: computePayloadChecksum(payload), schemaVersion: req.schemaVersion || 4, ...payload };
  }

  async processDelta(ctx: TenantContext, req: SyncDeltaRequest): Promise<SyncDeltaResponse> {
    await this.ensureInfrastructure();
    await this.reconcileJournal(ctx);
    const rawSince = req.since || "rev:0";
    const revisionMode = rawSince.startsWith("rev:");
    const afterRevision = revisionMode ? BigInt(rawSince.slice(4) || "0") : 0n;
    const changes = revisionMode
      ? await prisma.$queryRawUnsafe<Array<{ revision: bigint | number | string; tenant_id: string; branch_id: string; operation_id: string; entity_type: string; entity_id: string; operation_type: string; record: unknown; source: string; created_at: Date }>>(
          `SELECT revision, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source, created_at
             FROM sync_change_journal
            WHERE tenant_id = $1 AND branch_id = $2 AND revision > $3
            ORDER BY revision ASC LIMIT $4`,
          ctx.tenantId, ctx.branchId, afterRevision, MAX_DELTA,
        )
      : [];
    const lastDeliveredRevision = changes.length ? changes[changes.length - 1].revision : afterRevision;
    const normalizedChanges = changes.map((change: any) => ({ revision: String(change.revision), entityType: change.entity_type, entityId: change.entity_id, operationType: change.operation_type, record: change.record, source: change.source }));
    if (revisionMode) {
      return { serverTimestamp: new Date().toISOString(), products: [], variants: [], stockLedger: [], adjustments: [], customers: [], suppliers: [], ...( { serverRevision: String(lastDeliveredRevision), changes: normalizedChanges } as any ) } as any;
    }
    const since = new Date(rawSince);
    if (Number.isNaN(since.getTime())) throw new Error("SYNC_PROTOCOL_INVALID: invalid sync cursor");
    const anchor = new Date();
    return {
      serverTimestamp: anchor.toISOString(),
      products: (await this.productRepo.getProducts(ctx)).filter((p: any) => new Date(p.updatedAt).getTime() >= since.getTime() && new Date(p.updatedAt).getTime() <= anchor.getTime()),
      variants: await prisma.productVariant.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } } }),
      stockLedger: (await this.stockRepo.getLedger(ctx)).filter((x: any) => new Date(x.createdAt).getTime() >= since.getTime() && new Date(x.createdAt).getTime() <= anchor.getTime()),
      adjustments: await prisma.stockAdjustment.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } } }),
      customers: await prisma.customer.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } } }),
      suppliers: await prisma.supplier.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } } }),
      categories: await prisma.category.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } } }),
      brands: await prisma.brand.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } } }),
      ...( { serverRevision: String(afterRevision) } as any ),
    } as any;
  }
}
