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

  private async snapshot(ctx: TenantContext, op: SyncPushRequest["operations"][number]): Promise<unknown> {
    try {
      switch (op.entityType) {
        case "Product": return await this.productRepo.getProductById(ctx, op.entityId);
        case "ProductVariant": return await prisma.productVariant.findUnique({ where: { id: op.entityId } });
        case "StockAdjustment": return await prisma.stockAdjustment.findUnique({ where: { id: op.entityId } });
        case "Customer": return await prisma.customer.findUnique({ where: { id: op.entityId } });
        case "Supplier": return await prisma.supplier.findUnique({ where: { id: op.entityId } });
        default: return op.payload;
      }
    } catch {
      return op.payload;
    }
  }

  private async journal(ctx: TenantContext, req: SyncPushRequest, op: SyncPushRequest["operations"][number], record: unknown, source = "push"): Promise<string> {
    await this.ensureInfrastructure();
    const existing = await prisma.$queryRawUnsafe<JournalRow[]>(
      `SELECT revision, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source, created_at
       FROM sync_change_journal WHERE operation_id = $1 LIMIT 1`, op.operationId,
    );
    if (existing[0]) return String(existing[0].revision);
    const rows = await prisma.$queryRawUnsafe<Array<{ revision: bigint }>>(
      `INSERT INTO sync_change_journal
        (tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING revision`,
      ctx.tenantId, ctx.branchId, op.operationId, op.entityType, op.entityId, op.operationType,
      JSON.stringify(record ?? op.payload), source,
    );
    return String(rows[0].revision);
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
      await this.journal(ctx, { deviceId: "recovery", operations: [] } as any, {
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
        const existing = await prisma.syncOperation.findFirst({
          where: { tenantId: ctx.tenantId, deviceId: req.deviceId, OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }] },
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
          if (fingerprint !== operationFingerprint(op)) {
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_IDEMPOTENCY_CONFLICT" });
          } else {
            const snapshot = await this.snapshot(ctx, op);
            await this.journal(ctx, req, op, snapshot, "replay");
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
          }
          continue;
        }

        if (op.entityType === "Product" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          const existingProduct = await prisma.product.findUnique({ where: { id: op.entityId } });
          if (!existingProduct) await this.productRepo.createProduct(ctx, { ...payload, id: op.entityId });
        } else if (op.entityType === "Product" && op.operationType === "UPDATE") {
          const current = await this.productRepo.getProductById(ctx, op.entityId);
          const base = getBaseUpdatedAt(op.payload);
          if (!current) throw new Error(`Product ${op.entityId} not found`);
          if (base && new Date(current.updatedAt).getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: product changed on server");
          await this.productRepo.updateProduct(ctx, op.entityId, stripSyncControlFields(op.payload as any));
        } else if (op.entityType === "ProductVariant" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          const existingVariant = await prisma.productVariant.findUnique({ where: { id: op.entityId } });
          if (!existingVariant) await this.productRepo.addVariant(ctx, payload.productId, { ...payload, id: op.entityId });
        } else if (op.entityType === "ProductVariant" && ["UPDATE", "DELETE"].includes(op.operationType)) {
          const current = await prisma.productVariant.findUnique({ where: { id: op.entityId } });
          const base = getBaseUpdatedAt(op.payload);
          if (!current) {
            if (op.operationType === "DELETE") {
              await this.journal(ctx, req, op, { id: op.entityId, _deleted: true }, "push");
              results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
              continue;
            }
            throw new Error(`Variant ${op.entityId} not found`);
          }
          if (base && current.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: variant changed on server");
          if (op.operationType === "UPDATE") await this.productRepo.updateVariant(ctx, op.entityId, stripSyncControlFields(op.payload as any));
          else await prisma.productVariant.update({ where: { id: op.entityId }, data: { isActive: false } });
        } else if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") {
          await this.stockRepo.recordStockAdjustment(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "Sale" && op.operationType === "CREATE") {
          await this.finance.createSale(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "PurchaseReceipt" && op.operationType === "CREATE") {
          await this.finance.createPurchaseReceipt(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "Customer" && op.operationType === "CREATE") {
          const existingCustomer = await prisma.customer.findUnique({ where: { id: op.entityId } });
          if (!existingCustomer) await prisma.customer.create({ data: { ...(op.payload as any), id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
        } else if (op.entityType === "Supplier" && op.operationType === "CREATE") {
          const existingSupplier = await prisma.supplier.findUnique({ where: { id: op.entityId } });
          if (!existingSupplier) await prisma.supplier.create({ data: { ...(op.payload as any), id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
        } else {
          throw new Error(`Unsupported sync operation: ${op.entityType}/${op.operationType}`);
        }

        const snapshot = await this.snapshot(ctx, op);
        await prisma.syncOperation.create({
          data: {
            tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: req.deviceId,
            operationId: op.operationId, entityType: op.entityType, entityId: op.entityId,
            operationType: op.operationType, payload: op.payload as any, status: "PROCESSED",
            idempotencyKey: op.idempotencyKey, clientCreatedAt: new Date(op.clientCreatedAt), processedAt: new Date(),
          },
        });
        await this.journal(ctx, req, op, snapshot, "push");
        processedCount += 1;
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
      } catch (err: any) {
        if (err?.code === "P2002" || err?.code === "23505") {
          const committed = await prisma.syncOperation.findFirst({ where: { tenantId: ctx.tenantId, deviceId: req.deviceId, OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }] } });
          if (committed) {
            const snapshot = await this.snapshot(ctx, op);
            await this.journal(ctx, req, op, snapshot, "recovery");
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
    const head = BigInt(await this.latestRevision());
    const changes = revisionMode
      ? await prisma.$queryRawUnsafe<JournalRow[]>(
          `SELECT revision, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source, created_at
             FROM sync_change_journal
            WHERE tenant_id = $1 AND branch_id = $2 AND revision > $3
            ORDER BY revision ASC LIMIT $4`,
          ctx.tenantId, ctx.branchId, afterRevision.toString(), MAX_DELTA,
        )
      : [];

    const normalizedChanges = changes.map((change) => ({
      revision: String(change.revision),
      entityType: change.entity_type,
      entityId: change.entity_id,
      operationType: change.operation_type,
      record: change.record,
      source: change.source,
    }));

    if (revisionMode) {
      return {
        serverTimestamp: new Date().toISOString(),
        products: [], variants: [], stockLedger: [], adjustments: [], customers: [], suppliers: [],
        ...( { serverRevision: String(head), changes: normalizedChanges } as any ),
      } as any;
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
      ...( { serverRevision: String(head) } as any ),
    } as any;
  }
}
