import type { TenantContext, SyncPushRequest, SyncPushResponse, SyncDeltaRequest, SyncDeltaResponse } from "@kwakopos2/contracts";
import { PrismaProductRepository, PrismaStockRepository, PrismaAtomicCommercialFinanceService, prisma } from "@kwakopos2/database";
import { getBaseUpdatedAt, operationFingerprint, orderSyncOperations, stripSyncControlFields, validateSyncRequest } from "./syncIntegrity.js";

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
    if (this.infrastructureReady) return this.infrastructureReady;
    this.infrastructureReady = prisma.$executeRawUnsafe(`
      CREATE SEQUENCE IF NOT EXISTS sync_change_revision_seq;
      CREATE TABLE IF NOT EXISTS sync_change_journal (
        revision BIGINT PRIMARY KEY DEFAULT nextval('sync_change_revision_seq'),
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        operation_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        record JSONB NOT NULL,
        source TEXT NOT NULL DEFAULT 'push',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sync_change_journal_scope_revision_idx
        ON sync_change_journal (tenant_id, branch_id, revision);
      CREATE INDEX IF NOT EXISTS sync_change_journal_entity_idx
        ON sync_change_journal (tenant_id, branch_id, entity_type, entity_id, revision);
      CREATE TABLE IF NOT EXISTS sync_conflict_record (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_payload JSONB NOT NULL,
        remote_payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ
      );
    `).then(() => undefined);
    return this.infrastructureReady;
  }

  private async latestRevision(): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<Array<{ revision: bigint | null }>>(
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
    const rows = await prisma.$queryRawUnsafe<Array<{
      operationId: string; entityType: string; entityId: string; operationType: string; payload: unknown;
    }>>(
      `SELECT operation_id AS "operationId", entity_type AS "entityType", entity_id AS "entityId",
              operation_type AS "operationType", payload
         FROM sync_operations so
        WHERE tenant_id = $1 AND branch_id = $2 AND status = 'PROCESSED'
          AND NOT EXISTS (SELECT 1 FROM sync_change_journal cj WHERE cj.operation_id = so.operation_id)
        ORDER BY created_at ASC LIMIT 1000`,
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
            where: { tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: req.deviceId, OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }] },
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
        if (err?.code === "P2002" || err?.code === "23505") {
          const committed = await prisma.syncOperation.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: req.deviceId, OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }] } });
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

  async processDelta(ctx: TenantContext, req: SyncDeltaRequest): Promise<SyncDeltaResponse> {
    await this.ensureInfrastructure();
    await this.reconcileJournal(ctx);
    const rawSince = req.since || "rev:0";
    const revisionMode = rawSince.startsWith("rev:");
    const afterRevision = revisionMode ? BigInt(rawSince.slice(4) || "0") : 0n;
    const changes = revisionMode
      ? await prisma.$queryRawUnsafe<JournalRow[]>(
          `SELECT revision, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source, created_at
             FROM sync_change_journal
            WHERE tenant_id = $1 AND branch_id = $2 AND revision > $3
            ORDER BY revision ASC LIMIT $4`,
          ctx.tenantId, ctx.branchId, afterRevision.toString(), MAX_DELTA,
        )
      : [];
    const lastDeliveredRevision = changes.length ? changes[changes.length - 1].revision : afterRevision;
    const normalizedChanges = changes.map((change) => ({ revision: String(change.revision), entityType: change.entity_type, entityId: change.entity_id, operationType: change.operation_type, record: change.record, source: change.source }));
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
      ...( { serverRevision: String(afterRevision) } as any ),
    } as any;
  }
}
