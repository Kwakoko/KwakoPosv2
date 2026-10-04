import { randomUUID } from "node:crypto";
import type { TenantContext, SyncPushRequest, SyncPushResponse, SyncDeltaRequest, SyncDeltaResponse } from "@kwakopos2/contracts";
import { PrismaProductRepository, PrismaStockRepository, PrismaAtomicCommercialFinanceService, productShape, variantShape, ledgerShape, prisma } from "@kwakopos2/database";
import { computePayloadChecksum, getBaseUpdatedAt, operationFingerprint, orderSyncOperations, stripSyncControlFields, validateSyncRequest } from "./syncIntegrity.js";
import { calculateAuthoritativeStock, projectProductBranchStock, projectProductStockSummary, projectVariantInventory, rejectNonZeroAbsoluteInventoryMutation } from "@kwakopos2/database";
import { ReceiptEngine, ReceiptNumberGenerator } from "@kwakopos2/domain";
import {
  buildDomainEvent,
  ensureDurableDomainEventJournal,
  persistDomainEvent,
  publishPendingDomainEvents,
} from "./durableDomainEventBridge.js";

const MAX_DELTA = 500;

function expenseShape(row: any): any {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
    incurredAt: row.incurredAt instanceof Date ? row.incurredAt.toISOString() : row.incurredAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt,
    voidedAt: row.voidedAt instanceof Date ? row.voidedAt.toISOString() : row.voidedAt,
  };
}

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

export interface JournalCompactionStats {
  tenantId: string;
  branchId: string;
  totalEntries: number;
  minRevision: string | null;
  maxRevision: string | null;
  oldestEntryDate: string | null;
  newestEntryDate: string | null;
}

export interface JournalCompactionOptions {
  retainRevisions?: number;
  maxAgeDays?: number;
  beforeRevision?: string;
  dryRun?: boolean;
}

export interface JournalCompactionResult {
  tenantId: string;
  branchId: string;
  entriesExamined: number;
  prunedCount: number;
  safeRevisionThreshold: string;
  retainedCount: number;
  dryRun: boolean;
  compactedAt: string;
}

export type CompactionScopeContext = {
  tenantId: string;
  branchId: string;
  userId?: string;
  roles?: string[];
  permissions?: string[];
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
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS sync_change_journal (revision BIGINT PRIMARY KEY DEFAULT nextval('sync_change_revision_seq'), tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation_type TEXT NOT NULL, record JSONB NOT NULL, source TEXT NOT NULL DEFAULT 'push', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS sync_change_journal_tenant_branch_operation_uq ON sync_change_journal (tenant_id, branch_id, operation_id)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sync_change_journal_scope_revision_idx ON sync_change_journal (tenant_id, branch_id, revision)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS sync_change_journal_entity_idx ON sync_change_journal (tenant_id, branch_id, entity_type, entity_id, revision)`);
      await ensureDurableDomainEventJournal(prisma);
       await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS sync_conflict_record (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation_type TEXT NOT NULL DEFAULT 'UPDATE', local_payload JSONB NOT NULL, remote_payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ)`);
       await prisma.$executeRawUnsafe(`ALTER TABLE sync_conflict_record ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'UPDATE'`);
    })();
    return this.infrastructureReady!;
  }

  private async persistConflict(ctx: TenantContext, conflict: {
    id: string; operationId: string; entityType: string; entityId: string; operationType: string;
    localPayload: unknown; remotePayload: unknown; deviceId?: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx: any) => {
      const existing = await tx.$queryRawUnsafe(
        "SELECT status, tenant_id, branch_id FROM sync_conflict_record WHERE id = $1 FOR UPDATE",
        conflict.id,
      ) as Array<{ status: string; tenant_id: string; branch_id: string }>;
      if (existing[0] && (existing[0].tenant_id !== ctx.tenantId || existing[0].branch_id !== ctx.branchId)) {
        throw new Error("SYNC_CONFLICT_ID_COLLISION");
      }
      if (existing[0]?.status && existing[0].status !== "OPEN") return;
      if (existing[0]?.status === "OPEN") {
        await tx.$executeRawUnsafe(
          "UPDATE sync_conflict_record SET remote_payload = $1::jsonb WHERE id = $2 AND tenant_id = $3 AND branch_id = $4 AND status = 'OPEN'",
          JSON.stringify(conflict.remotePayload || {}), conflict.id, ctx.tenantId, ctx.branchId,
        );
        return;
      }
      await tx.$executeRawUnsafe(
        "INSERT INTO sync_conflict_record (id, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, local_payload, remote_payload, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'OPEN') ON CONFLICT (id) DO NOTHING",
        conflict.id, ctx.tenantId, ctx.branchId, conflict.operationId, conflict.entityType, conflict.entityId, conflict.operationType,
        JSON.stringify(conflict.localPayload || {}), JSON.stringify(conflict.remotePayload || {})
      );
      await tx.auditEvent.create({
        data: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
          deviceId: conflict.deviceId || "sync-engine", action: "SYNC_CONFLICT_DETECTED",
          entityType: conflict.entityType, entityId: conflict.entityId,
          metadata: {
            conflictId: conflict.id, operationId: conflict.operationId,
            operationType: conflict.operationType, localPayload: conflict.localPayload,
            remotePayload: conflict.remotePayload,
          },
        },
      });
    });
  }

  public async registerConflict(ctx: TenantContext, input: {
    conflictId: string;
    operationId: string;
    entityType: string;
    entityId: string;
    operationType?: string;
    localPayload?: unknown;
    remotePayload?: unknown;
    deviceId?: string;
  }): Promise<{ status: string; conflictId: string }> {
    await this.ensureInfrastructure();
    if (!input.conflictId || !input.operationId || !input.entityType || !input.entityId) {
      throw new Error("SYNC_CONFLICT_REGISTRATION_INVALID");
    }
    await this.persistConflict(ctx, {
      id: input.conflictId,
      operationId: input.operationId,
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType || "UPDATE",
      localPayload: input.localPayload || {},
      remotePayload: input.remotePayload || {},
      deviceId: input.deviceId,
    });
    const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
      "SELECT status FROM sync_conflict_record WHERE id = $1 AND tenant_id = $2 AND branch_id = $3",
      input.conflictId, ctx.tenantId, ctx.branchId,
    );
    return { status: String(rows[0]?.status || "OPEN"), conflictId: input.conflictId };
  }

  private async scopedRecord(tx: any, ctx: TenantContext, entityType: string, entityId: string): Promise<any> {
    let record: any = null;
    switch (entityType) {
      case "Product": record = await tx.product.findUnique({ where: { id: entityId } }); break;
      case "ProductVariant": record = await tx.productVariant.findUnique({ where: { id: entityId } }); break;
      case "Customer": record = await tx.customer.findUnique({ where: { id: entityId } }); break;
      case "Supplier": record = await tx.supplier.findUnique({ where: { id: entityId } }); break;
      case "Category": record = await tx.category.findUnique({ where: { id: entityId } }); break;
      case "Brand": record = await tx.brand.findUnique({ where: { id: entityId } }); break;
      case "Expense": record = await tx.expense.findUnique({ where: { id: entityId } }); break;
      default: return null;
    }
    if (!record) throw new Error("SYNC_CONFLICT_ENTITY_NOT_FOUND");
    if (record.tenantId !== ctx.tenantId || record.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
    return record;
  }
  private async latestRevision(ctx: TenantContext, db: any = prisma): Promise<string> {
    const rows = await db.$queryRawUnsafe(
      `SELECT COALESCE(MAX(revision), 0) AS revision FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2`,
      ctx.tenantId,
      ctx.branchId,
    ) as Array<{ revision: bigint | number | string | null }>;
    return String(rows[0]?.revision ?? 0);
  }

  private async currentSyncEpoch(db: any = prisma): Promise<string> {
    const rows = await db.$queryRawUnsafe(
      `SELECT sync_epoch::text AS sync_epoch FROM sync_control_state WHERE id = 1`,
    ) as Array<{ sync_epoch: string | null }>;
    const syncEpoch = String(rows[0]?.sync_epoch ?? "").trim();
    if (!syncEpoch) {
      throw new Error("SYNC_EPOCH_PERSISTENCE_UNAVAILABLE");
    }
    return syncEpoch;
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
        case "PurchaseOrder": return await db.purchaseOrder.findUnique({ where: { id: op.entityId }, include: { items: true } });
        case "PurchaseReceipt": return await db.purchaseReceipt.findUnique({ where: { id: op.entityId }, include: { items: true } });
        case "Payment": return await db.payment.findUnique({ where: { id: op.entityId } });
        case "Expense": return await db.expense.findUnique({ where: { id: op.entityId } });
        case "Setting": {
          const byId = await db.setting.findUnique({ where: { id: op.entityId } });
          if (byId) return byId;
          const p: any = op.payload || {};
          const scope = String(p.scope || "BRANCH").toUpperCase();
          return await db.setting.findFirst({
            where: {
              tenantId: ctx.tenantId,
              key: String(p.key || ""),
              scope,
              branchId: scope === "BRANCH" ? ctx.branchId : null,
              userId: scope === "USER" ? ctx.userId : null,
            },
            orderBy: { updatedAt: "desc" },
          });
        }
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

  private async journalGeneratedStockLedgers(
    ctx: TenantContext,
    op: SyncPushRequest["operations"][number],
    source: string,
    db: any,
  ): Promise<void> {
    if (op.operationType !== "CREATE") return;

    // These business commands can atomically create one or more immutable
    // StockLedger rows. The ledger rows are inventory truth, so every row must be
    // independently replayable by downstream replicas.
    const generatedLedgerTypes = new Set(["StockAdjustment", "Sale", "PurchaseReceipt", "UnitConversionTransaction"]);
    if (!generatedLedgerTypes.has(op.entityType)) return;

    const operationIdFilter = op.entityType === "UnitConversionTransaction"
      ? { startsWith: `${op.operationId}-` }
      : op.operationId;
    const ledgers = await db.stockLedger.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        operationId: operationIdFilter,
      },
      orderBy: { createdAt: "asc" },
    });
    for (const ledger of ledgers) {
      const ledgerOp = {
        ...op,
        operationId: `${op.operationId}:ledger:${ledger.id}`,
        idempotencyKey: `${op.idempotencyKey}:ledger:${ledger.id}`,
        entityType: "StockLedger",
        entityId: ledger.id,
        operationType: "CREATE",
      } as SyncPushRequest["operations"][number];
      await this.journal(ctx, ledgerOp, ledgerShape(ledger), source, db);
    }
  }

  private async reconcileJournal(ctx: TenantContext): Promise<void> {
    await this.ensureInfrastructure();
    const rows = await prisma.$queryRawUnsafe<Array<{ operationId: string; entityType: string; entityId: string; operationType: string; payload: unknown }>>(
      `SELECT so.operation_id AS "operationId", so.entity_type AS "entityType", so.entity_id AS "entityId",
              so.operation_type AS "operationType", so.payload
         FROM sync_operations so
        WHERE so.tenant_id = $1 AND so.branch_id = $2 AND so.status = 'PROCESSED'
          AND NOT EXISTS (
            SELECT 1 FROM sync_change_journal cj
             WHERE cj.tenant_id = so.tenant_id
               AND cj.branch_id = so.branch_id
               AND cj.operation_id = so.operation_id
          )
        ORDER BY so.created_at ASC LIMIT 1000`,
      ctx.tenantId, ctx.branchId,
    );
    for (const row of rows) {
      const recoveredOp = {
        operationId: row.operationId,
        entityType: row.entityType as any,
        entityId: row.entityId,
        operationType: row.operationType as any,
        payload: { ...(row.payload as any), __syncRecoveryPatch: true },
        clientCreatedAt: new Date(0).toISOString(),
        idempotencyKey: row.operationId,
      } as any;
      await this.journal(ctx, recoveredOp, row.payload, "recovery");
      await this.journalGeneratedStockLedgers(ctx, recoveredOp, "recovery", prisma);
    }

    const generatedLedgerRows = await prisma.$queryRawUnsafe<Array<{ operationId: string; entityType: string; entityId: string; operationType: string; payload: unknown }>>(
      `SELECT so.operation_id AS "operationId", so.entity_type AS "entityType", so.entity_id AS "entityId",
              so.operation_type AS "operationType", so.payload
         FROM sync_operations so
        WHERE so.tenant_id = $1 AND so.branch_id = $2 AND so.status = 'PROCESSED'
          AND so.operation_type = 'CREATE'
          AND so.entity_type IN ('StockAdjustment', 'Sale', 'PurchaseReceipt', 'UnitConversionTransaction')
          AND NOT EXISTS (
            SELECT 1 FROM sync_change_journal cj
             WHERE cj.tenant_id = so.tenant_id
               AND cj.branch_id = so.branch_id
               AND cj.operation_id LIKE so.operation_id || ':ledger:%'
          )
        ORDER BY so.created_at ASC LIMIT 1000`,
      ctx.tenantId, ctx.branchId,
    );
    for (const row of generatedLedgerRows) {
      await this.journalGeneratedStockLedgers(ctx, {
        operationId: row.operationId,
        entityType: row.entityType as any,
        entityId: row.entityId,
        operationType: row.operationType as any,
        payload: row.payload as any,
        clientCreatedAt: new Date(0).toISOString(),
        idempotencyKey: row.operationId,
      } as any, "recovery", prisma);
    }
  }

  private async applyOperationInTransaction(ctx: TenantContext, req: SyncPushRequest, op: SyncPushRequest["operations"][number], tx: any): Promise<void> {
    if (op.entityType === "Setting" && ["CREATE", "UPDATE", "DELETE"].includes(op.operationType)) {
      const payload: any = stripSyncControlFields(op.payload as any);
      const key = String(payload.key || "").trim();
      const scope = String(payload.scope || "BRANCH").toUpperCase();
      if (!key) throw new Error("SETTING_KEY_REQUIRED");
      if (!["TENANT", "BRANCH", "USER"].includes(scope)) throw new Error("SETTING_SCOPE_INVALID");
      const branchId = scope === "BRANCH" ? ctx.branchId : null;
      const userId = scope === "USER" ? ctx.userId : null;
      if (scope === "BRANCH" && payload.branchId && payload.branchId !== ctx.branchId) throw new Error("SETTING_BRANCH_SCOPE_FORBIDDEN");

      const existingById = await tx.setting.findUnique({ where: { id: op.entityId } });
      if (existingById && existingById.tenantId !== ctx.tenantId) throw new Error("TENANT_BOUNDARY_VIOLATION");
      const existing = existingById || await tx.setting.findFirst({
        where: { tenantId: ctx.tenantId, key, scope, branchId, userId, isActive: true },
        orderBy: { updatedAt: "desc" },
      });

      if (op.operationType === "DELETE") {
        if (!existing) return;
        if (existing.branchId && existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
        await tx.setting.update({ where: { id: existing.id }, data: { isActive: false, version: { increment: 1 } } });
      } else if (existing) {
        if (existing.branchId && existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
        await tx.setting.update({ where: { id: existing.id }, data: { value: payload.value ?? {}, version: { increment: 1 }, isActive: true } });
      } else {
        await tx.setting.create({
          data: {
            id: op.entityId,
            tenantId: ctx.tenantId,
            branchId,
            userId,
            scope,
            key,
            value: payload.value ?? {},
            version: 1,
            isActive: true,
          },
        });
      }

      const row = await tx.setting.findUnique({ where: { id: existing?.id || op.entityId } });
      if (!row) throw new Error("SETTING_PERSISTENCE_FAILED");

      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: req.deviceId,
          action: "SETTING_UPDATED",
          entityType: "Setting",
          entityId: row.id,
          metadata: {
            key,
            scope,
            operationType: op.operationType,
            settingVersion: row.version,
            beforeValue: existing?.value ?? null,
            afterValue: op.operationType === "DELETE" ? null : row.value,
          },
        },
      });
      return;
    }

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
            categoryId: payload.categoryId ?? null,
            brandId: payload.brandId ?? payload.brand_id ?? null,
            supplierId: payload.supplierId ?? null,
            taxId: payload.taxId ?? null,
            category: payload.category ?? "General",
            buyingPrice: payload.buyingPrice ?? 0,
            sellingPrice: payload.sellingPrice ?? 0,
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
      await tx.product.update({ where: { id: op.entityId }, data: { name: payload.name, description: payload.description, sku: payload.sku, categoryId: payload.categoryId, brandId: payload.brandId ?? payload.brand_id, supplierId: payload.supplierId, taxId: payload.taxId, category: payload.category, buyingPrice: payload.buyingPrice, sellingPrice: payload.sellingPrice, isActive: payload.isActive } });
      return;
    }

    if (op.entityType === "ProductVariant" && op.operationType === "CREATE") {
      const payload = op.payload as any;
      const product = await tx.product.findUnique({ where: { id: payload.productId } });
      if (!product) throw new Error(`Product ${payload.productId} not found`);
      if (product.tenantId !== ctx.tenantId || product.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      const existing = await tx.productVariant.findUnique({ where: { id: op.entityId } });
      if (!existing) {
        await tx.productVariant.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, productId: payload.productId, name: payload.name, sku: payload.sku, barcode: payload.barcode ?? null, price: payload.price, costPrice: payload.costPrice, inventoryQuantity: payload.inventoryQuantity ?? payload.stock ?? 0, reservedQuantity: payload.reservedQuantity ?? 0, reorderLevel: payload.reorderLevel ?? 0, attributes: payload.attributes ?? {}, isActive: payload.isActive ?? true } });
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
        if (payload.inventoryQuantity !== undefined || payload.stock !== undefined) {
          throw new Error("INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER");
        }
        await tx.productVariant.update({ where: { id: op.entityId }, data: { name: payload.name, sku: payload.sku, barcode: payload.barcode, price: payload.price, costPrice: payload.costPrice, reservedQuantity: payload.reservedQuantity, reorderLevel: payload.reorderLevel, attributes: payload.attributes, isActive: payload.isActive } });
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
      const existing = await tx.stockAdjustment.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: op.idempotencyKey } });
      if (existing) return;
      await tx.$queryRawUnsafe(`SELECT id FROM product_variants WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE`, payload.variantId, ctx.tenantId, ctx.branchId);
      const variant = await tx.productVariant.findUnique({ where: { id: payload.variantId } });
      if (!variant || variant.tenantId !== ctx.tenantId || variant.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
      let changeQty = Number(payload.quantityChange ?? 0);
      if (payload.adjustmentType === "DECREASE") changeQty = -Math.abs(changeQty);
      if (payload.adjustmentType === "SET") {
        const ledger = await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: payload.variantId } });
        const currentStock = ledger.reduce((sum: number, row: any) => sum + Number(row.quantityChange ?? row.quantity ?? 0), 0);
        changeQty = Number(payload.quantityChange) - currentStock;
      }
      const beforeSum = await tx.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: payload.variantId } });
      const quantityBefore = Number(beforeSum._sum.quantityChange ?? 0);
      const quantityAfter = quantityBefore + changeQty;
      if (quantityAfter < 0) throw new Error("INSUFFICIENT_STOCK: stock cannot become negative");
      const unitCost = Number(payload.unitCost ?? variant.costPrice ?? 0);
      const adjustment = await tx.stockAdjustment.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: payload.variantId, adjustmentType: payload.adjustmentType, quantityChange: changeQty, reason: payload.reason, referenceNote: payload.referenceNote ?? null, status: "COMPLETED", createdByUserId: ctx.userId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey } });
      await tx.stockLedger.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: payload.variantId, movementType: changeQty >= 0 ? "ADJUSTMENT_GAIN" : "ADJUSTMENT_LOSS", quantityChange: changeQty, quantity: changeQty, quantityBefore, quantityAfter, unitCost, totalCost: Math.abs(changeQty) * unitCost, referenceType: "StockAdjustment", referenceId: adjustment.id, occurredAt: new Date(), deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey } });

      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, payload.variantId);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, payload.variantId, null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
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
      const parentCurrentQty = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, parentVariant.id);
      const childCurrentQty = await calculateAuthoritativeStock(tx, ctx.tenantId, ctx.branchId, childVariant.id);

      if (parentCurrentQty < parentUnitsDeducted) {
        throw new Error("CONVERSION_CONFLICT: INSUFFICIENT_PARENT_STOCK (Available: " + parentCurrentQty + ", Required: " + parentUnitsDeducted + ")");
      }

      const parentNextQty = Math.max(0, parentCurrentQty - parentUnitsDeducted);
      const childNextQty = childCurrentQty + childUnitsProduced;

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
          quantityBefore: childCurrentQty,
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
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, parentVariant.id);
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, childVariant.id);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, parentVariant.id, null);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, childVariant.id, null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, parentVariant.productId);
      if (childVariant.productId !== parentVariant.productId) await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, childVariant.productId);
      return;
    }

    if (op.entityType === "Sale" && op.operationType === "CREATE") {
      const financeTx = new PrismaAtomicCommercialFinanceService({ $transaction: async (work: any) => work(tx) });
      await financeTx.createSale(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
      return;
    }

    if (op.entityType === "Receipt" && op.operationType === "CREATE") {
      const sale = await tx.sale.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          OR: [{ id: (op.payload as any).transactionId }, { saleNumber: (op.payload as any).transactionId }],
        },
        include: { lines: true, payments: true },
      });
      if (!sale) throw new Error("RECEIPT_AUTHORITATIVE_SALE_NOT_FOUND");
      const existingByTransaction = await tx.receipt.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, transactionId: sale.id },
        include: { items: true },
      });
      if (existingByTransaction) return;

      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const sequenceKey = `receipt:${ctx.tenantId}:${ctx.branchId}:${dayStart.toISOString().slice(0, 10)}`;
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, sequenceKey);
      const seqRows = await tx.$queryRawUnsafe(
        `SELECT COALESCE(MAX((substring("receiptNumber" from '([0-9]+)$'))::bigint), 0) + 1 AS seq
           FROM receipts
          WHERE "tenantId" = $1 AND "branchId" = $2
            AND "createdAt" >= $3 AND "createdAt" < $4`,
        ctx.tenantId, ctx.branchId, dayStart, dayEnd,
      ) as Array<{ seq: bigint | number | string }>;
      const receiptNumber = ReceiptNumberGenerator.generate({
        tenantPrefix: ctx.tenantId.slice(0, 3),
        branchPrefix: ctx.branchId.slice(0, 3),
        sequenceType: "DAILY",
        sequenceNumber: Number(seqRows[0]?.seq ?? 1),
        date: now,
      });
      const grandTotal = Number(sale.grandTotal);
      const signatureTimestamp = now.toISOString();
      const digitalSignature = ReceiptEngine.calculateDigitalSignature(receiptNumber, sale.id, grandTotal, signatureTimestamp);
      const paidAmount = sale.payments.filter((p: any) => p.status === "COMPLETED").reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const changeAmount = Math.max(0, paidAmount - grandTotal);
      await tx.receipt.create({
        data: {
          id: op.entityId || randomUUID(),
          receiptNumber,
          transactionId: sale.id,
          transactionType: "POS_SALE",
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          cashierId: sale.soldById || ctx.userId,
          cashierName: null,
          customerId: sale.customerId,
          subtotal: Number(sale.subtotal),
          discountTotal: Number(sale.discountTotal),
          taxTotal: Number(sale.taxTotal),
          grandTotal,
          paidAmount,
          changeAmount,
          paymentMethod: sale.payments[0]?.paymentMethod || "CASH",
          currency: (op.payload as any).currency || "TZS",
          exchangeRate: 1,
          status: "COMPLETED",
          deviceId: req.deviceId,
          createdAt: now,
          syncStatus: "SYNCED",
          digitalSignature,
          qrCodePayload: ReceiptEngine.generateQrCodePayload(
            sale.id, receiptNumber, sale.id,
            process.env.RECEIPT_VERIFICATION_URL || "https://pos.kwako.app/verify-receipt",
            digitalSignature,
          ),
          barcodePayload: ReceiptEngine.generateBarcodePayload(receiptNumber),
          items: {
            create: sale.lines.map((line: any) => ({
              id: randomUUID(),
              productId: line.productId,
              variantId: line.variantId,
              sku: (op.payload as any).items?.find((x: any) => x.variantId === line.variantId)?.sku || line.variantId,
              name: (op.payload as any).items?.find((x: any) => x.variantId === line.variantId)?.name || line.variantId,
              qty: Number(line.quantity),
              unitPrice: Number(line.unitPrice),
              discount: Number(line.discountAmount),
              taxRate: 0,
              taxAmount: Number(line.taxAmount),
              lineTotal: Number(line.lineTotal),
            })),
          },
          auditLogs: {
            create: {
              action: "CREATED_FROM_AUTHORITATIVE_SALE_SYNC",
              actorId: ctx.userId,
              deviceId: req.deviceId,
              branchId: ctx.branchId,
              details: JSON.stringify({ saleId: sale.id, operationId: op.operationId }),
            },
          },
        },
      });
      return;
    }

    if (op.entityType === "PurchaseOrder" && op.operationType === "CREATE") {
      const payload: any = stripSyncControlFields(op.payload as any);
      const existing = await tx.purchaseOrder.findUnique({ where: { id: op.entityId }, include: { items: true } });
      if (existing) {
        if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
        return;
      }
      const supplier = await tx.supplier.findFirst({ where: { id: payload.supplierId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
      if (supplier.status !== "ACTIVE") throw new Error("SUPPLIER_NOT_ACTIVE");
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) throw new Error("PURCHASE_ORDER_ITEMS_REQUIRED");
      const variants = await tx.productVariant.findMany({ where: { id: { in: items.map((i: any) => i.variantId) }, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (variants.length !== items.length) throw new Error("PURCHASE_ORDER_VARIANT_BOUNDARY_VIOLATION");
      const totalAmount = items.reduce((sum: number, i: any) => sum + Number(i.quantityOrdered) * Number(i.unitCost), 0);
      const orderNumber = payload.orderNumber || `PUR-MAIN-${Date.now()}`;
      await tx.purchaseOrder.create({ data: {
        id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, orderNumber,
        supplierId: payload.supplierId, status: payload.status || "DRAFT", totalAmount,
        notes: payload.notes ?? null, createdById: ctx.userId, approvedById: payload.status === "APPROVED" ? ctx.userId : null,
        items: { create: items.map((i: any) => ({ id: i.id || randomUUID(), variantId: i.variantId, quantityOrdered: i.quantityOrdered, quantityReceived: i.quantityReceived || 0, unitCost: i.unitCost, totalCost: Number(i.quantityOrdered) * Number(i.unitCost) })) },
      } });
      return;
    }

    if (op.entityType === "Expense" && ["CREATE", "UPDATE", "DELETE"].includes(op.operationType)) {
      if (op.operationType === "DELETE") throw new Error("EXPENSE_DELETE_FORBIDDEN: use governed Expense void/reversal");

      const payload: any = stripSyncControlFields(op.payload as any);
      const existing = await tx.expense.findUnique({ where: { id: op.entityId } });
      const financeTx = new PrismaAtomicCommercialFinanceService({ $transaction: async (work: any) => work(tx) });

      if (op.operationType === "CREATE") {
        if (existing) {
          if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
          return;
        }
        await financeTx.recordExpense(ctx, {
          ...payload, id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey,
        });
        return;
      }

      if (!existing) {
        throw new Error("EXPENSE_NOT_FOUND");
      }
      if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");

      const base = getBaseUpdatedAt(op.payload);
      if (base && existing.updatedAt.getTime() > new Date(base).getTime()) throw new Error("STALE_WRITE_CONFLICT: expense changed on server");

      if (payload.status === "VOIDED") {
        await financeTx.voidExpense(ctx, op.entityId, String(payload.voidReason || payload.reason || "Voided from synchronized client mutation"), {
          deviceId: req.deviceId, idempotencyKey: op.idempotencyKey,
        });
        return;
      }

      if (payload.status === "PAID" && existing.status !== "PAID") {
        await financeTx.payExpense(ctx, op.entityId, {
          paymentMethod: payload.paymentMethod || existing.paymentMethod || "CASH",
          paymentRef: payload.paymentRef,
          cashSessionId: payload.cashSessionId || existing.cashSessionId || undefined,
          deviceId: req.deviceId,
          idempotencyKey: op.idempotencyKey,
        });
        return;
      }

      if (existing.status !== "PENDING") throw new Error("EXPENSE_INVALID_STATE_TRANSITION");
      await tx.expense.update({
        where: { id: op.entityId },
        data: {
          category: payload.category,
          reason: payload.reason,
          description: payload.description,
          payee: payload.payee,
          paymentMethod: payload.paymentMethod || existing.paymentMethod,
          paymentRef: payload.paymentRef !== undefined ? payload.paymentRef : existing.paymentRef,
          taxDeductible: payload.taxDeductible !== undefined ? Boolean(payload.taxDeductible) : existing.taxDeductible,
          incurredAt: payload.incurredAt ? new Date(payload.incurredAt) : undefined,
        },
      });
      return;
    }

    if (op.entityType === "Payment" && op.operationType === "CREATE") {
      const payload: any = stripSyncControlFields(op.payload as any);
      if (!payload.supplierId || Number(payload.amount) <= 0) throw new Error("PAYMENT_SUPPLIER_AMOUNT_REQUIRED");
      const supplier = await tx.supplier.findFirst({ where: { id: payload.supplierId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
      const existing = await tx.payment.findUnique({ where: { id: op.entityId } });
      if (existing) return;
      const amount = Number(payload.amount);
      if (amount > Number(supplier.outstandingBalance)) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING_PAYABLE");
      await tx.payment.create({ data: { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber: payload.paymentNumber || `PAY-SUP-${op.operationId.slice(0, 24)}`, purchaseReceiptId: payload.purchaseReceiptId || null, supplierId: supplier.id, amount, paymentMethod: payload.paymentMethod || "BANK", provider: payload.provider || null, providerReference: payload.providerReference || null, status: "COMPLETED", paidAt: new Date() } });
      await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { decrement: amount } } });
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
        if (["Role", "User", "Employee", "PlatformSecurity", "SuperAdmin"].includes(op.entityType) || JSON.stringify(op.payload || {}).includes("SUPER_ADMIN")) {
          throw new Error("PRIVILEGE_ESCALATION_ATTEMPT_DENIED: privileged entities cannot be mutated through sync.");
        }
        if (op.entityType === "Setting") {
          const permissions = (ctx.permissions || []).map(String).map((p) => p.toLowerCase());
          const roles = (ctx.roles || []).map(String).map((r) => r.toUpperCase());
          const allowed = permissions.includes("*") || permissions.includes("settings.manage") || roles.some((r) => ["ADMIN", "OWNER", "SUPER_ADMIN", "SUPERADMIN"].includes(r));
          if (!allowed) throw new Error("SETTINGS_MANAGE_REQUIRED");
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
            const revision = await this.journal(ctx, op, snapshot, "replay", tx);
            await persistDomainEvent(
              tx,
              buildDomainEvent(ctx, op, snapshot, revision, "sync-replay"),
              "sync-replay",
            );
            await this.journalGeneratedStockLedgers(ctx, op, "replay", tx);
            return { status: "ALREADY_PROCESSED" as const, revision };
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
          await persistDomainEvent(
            tx,
            buildDomainEvent(ctx, op, snapshot, revision, "sync"),
            "sync",
          );
          await this.journalGeneratedStockLedgers(ctx, op, "push", tx);
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
          await this.persistConflict(ctx, { id: conflictId, operationId: op.operationId, entityType: op.entityType, entityId: op.entityId, operationType: op.operationType, localPayload: op.payload, remotePayload: remote, deviceId: req.deviceId });
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_CONFLICT:" + conflictId });
          continue;
        }
        if (String(err?.message || "").startsWith("CONVERSION_CONFLICT:")) {
          const conflictId = "conflict:conversion:" + op.operationId;
          const payload = op.payload;
          const available = await calculateAuthoritativeStock(prisma, ctx.tenantId, ctx.branchId, String(payload.parentVariantId)).catch(() => 0);
          await this.persistConflict(ctx, { id: conflictId, operationId: op.operationId, entityType: "UnitConversionConflict", entityId: String(payload.parentVariantId), operationType: op.operationType, localPayload: payload, remotePayload: { availableParentStock: available, required: Number(payload.parentUnitsDeducted || 0) }, deviceId: req.deviceId });
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_CONFLICT:" + conflictId });
          continue;
        }        if (err?.code === "P2002" || err?.code === "23505") {
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
    try {
      // Durable journal rows are the delivery boundary. The process-local event
      // bus receives events only after PostgreSQL has committed the mutation.
      // Pending rows remain durable and can be redelivered on a later request.
      await publishPendingDomainEvents(ctx);
    } catch (eventError) {
      // Event delivery must never roll back an already committed business mutation.
      console.warn("[DOMAIN_EVENT] pending delivery deferred:", eventError);
    }
    return { processedCount, results };
  }

  async resolveConflict(ctx: TenantContext, conflictId: string, resolution: "ACCEPT_SERVER" | "ACCEPT_LOCAL" | "MERGE", mergedPayload?: Record<string, unknown>): Promise<{ status: string; operationId?: string; revision?: string }> {
    await this.ensureInfrastructure();
    return prisma.$transaction(async (tx: any) => {
      const rows = await tx.$queryRawUnsafe(
        "SELECT id, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, local_payload, remote_payload, status FROM sync_conflict_record WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 FOR UPDATE",
        conflictId, ctx.tenantId, ctx.branchId,
      );
      const conflict = rows[0];
      if (!conflict) throw new Error("SYNC_CONFLICT_NOT_FOUND");
      if (conflict.status !== "OPEN") return { status: conflict.status };

      const chosen = resolution === "ACCEPT_SERVER"
        ? conflict.remote_payload
        : resolution === "ACCEPT_LOCAL"
          ? conflict.local_payload
          : mergedPayload;
      if (!chosen || typeof chosen !== "object") throw new Error("SYNC_CONFLICT_MERGED_PAYLOAD_REQUIRED");
      const entityType = String(conflict.entity_type);
      const resolverOperationId = "conflict-resolution:" + conflictId;
      let revision: string | undefined;
      const payload: any = stripSyncControlFields(chosen as Record<string, unknown>);

      if (entityType === "SaleOversell") {
        // Committed business incident: resolution acknowledges the incident without rewriting sale/ledger history.
      } else if (entityType === "UnitConversionConflict") {
        if (resolution !== "ACCEPT_SERVER") {
          const op: any = {
            operationId: resolverOperationId,
            entityType: "UnitConversionTransaction",
            entityId: String(payload.id || conflict.operation_id),
            operationType: "CREATE",
            payload,
            clientCreatedAt: new Date().toISOString(),
            idempotencyKey: resolverOperationId,
          };
          await this.applyOperationInTransaction(ctx, { deviceId: "conflict-resolver:" + ctx.userId, operations: [op] } as any, op, tx);
          const snapshot = await this.snapshot(ctx, op, tx);
          await tx.syncOperation.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: "conflict-resolver:" + ctx.userId, operationId: resolverOperationId, entityType: op.entityType, entityId: op.entityId, operationType: op.operationType, payload: op.payload, status: "PROCESSED", idempotencyKey: op.idempotencyKey, clientCreatedAt: new Date(), processedAt: new Date() } });
          revision = await this.journal(ctx, op, snapshot, "conflict-resolution", tx);
        }
      } else {
        const current = await this.scopedRecord(tx, ctx, entityType, String(conflict.entity_id));
        const effective: any = { ...current, ...payload };
        const deleting = String(conflict.operation_type || "UPDATE") === "DELETE";
        switch (entityType) {
          case "Product":
            await tx.product.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { name: effective.name, description: effective.description ?? null, sku: effective.sku, categoryId: effective.categoryId ?? null, brandId: effective.brandId ?? effective.brand_id ?? null, supplierId: effective.supplierId ?? null, taxId: effective.taxId ?? null, category: effective.category ?? current.category, buyingPrice: effective.buyingPrice ?? current.buyingPrice, sellingPrice: effective.sellingPrice ?? current.sellingPrice, isActive: deleting ? false : (effective.isActive ?? true) } });
            break;
          case "ProductVariant":
            if (effective.inventoryQuantity !== undefined || effective.stock !== undefined) throw new Error("INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER");
            await tx.productVariant.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { name: effective.name, sku: effective.sku, barcode: effective.barcode ?? null, price: effective.price ?? current.price, costPrice: effective.costPrice ?? current.costPrice, reservedQuantity: effective.reservedQuantity ?? current.reservedQuantity, reorderLevel: effective.reorderLevel ?? current.reorderLevel, attributes: effective.attributes ?? current.attributes, isActive: deleting ? false : (effective.isActive ?? true) } });
            break;
          case "Customer":
            await tx.customer.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { customerCode: effective.customerCode ?? current.customerCode, name: effective.name ?? current.name, phone: effective.phone ?? null, email: effective.email ?? null, address: effective.address ?? null, creditLimit: effective.creditLimit ?? current.creditLimit, openingBalance: effective.openingBalance ?? current.openingBalance, status: deleting ? "INACTIVE" : (effective.status ?? current.status) } });
            break;
          case "Supplier":
            await tx.supplier.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { supplierCode: effective.supplierCode ?? current.supplierCode, name: effective.name ?? current.name, phone: effective.phone ?? null, email: effective.email ?? null, address: effective.address ?? null, taxPin: effective.taxPin ?? null, status: deleting ? "INACTIVE" : (effective.status ?? current.status) } });
            break;
          case "Category":
            if (deleting) {
              const replacementId = effective.replacementId;
              const count = await tx.product.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: conflict.entity_id, isActive: true } });
              if (count > 0 && !replacementId) throw new Error("Category has assigned products; replacementId is required");
              if (replacementId) {
                const replacement = await tx.category.findUnique({ where: { id: String(replacementId) } });
                if (!replacement || replacement.tenantId !== ctx.tenantId || replacement.branchId !== ctx.branchId || !replacement.isActive) throw new Error("Replacement category is invalid");
                await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: conflict.entity_id }, data: { categoryId: replacement.id, category: replacement.name } });
              }
              await tx.category.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { isActive: false } });
            } else {
              await tx.category.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { name: effective.name, code: effective.code ?? current.code, parentId: effective.parentId ?? null, description: effective.description ?? null, color: effective.color ?? null, isActive: effective.isActive ?? true } });
            }
            break;
          case "Brand":
            if (deleting) {
              const replacementId = effective.replacementId;
              const count = await tx.product.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, brandId: conflict.entity_id, isActive: true } });
              if (count > 0 && !replacementId) throw new Error("Brand has assigned products; replacementId is required");
              if (replacementId) {
                const replacement = await tx.brand.findUnique({ where: { id: String(replacementId) } });
                if (!replacement || replacement.tenantId !== ctx.tenantId || replacement.branchId !== ctx.branchId || !replacement.isActive) throw new Error("Replacement brand is invalid");
                await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, brandId: conflict.entity_id }, data: { brandId: replacement.id } });
              }
              await tx.brand.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { isActive: false } });
            } else {
              await tx.brand.updateMany({ where: { id: String(conflict.entity_id), tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { name: effective.name, code: effective.code ?? current.code, origin: effective.origin ?? null, notes: effective.notes ?? null, isActive: effective.isActive ?? true } });
            }
            break;
          default:
            throw new Error("SYNC_CONFLICT_RESOLUTION_UNSUPPORTED:" + entityType);
        }

        const op: any = {
          operationId: resolverOperationId,
          entityType,
          entityId: String(conflict.entity_id),
          operationType: "UPDATE",
          payload: effective,
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: resolverOperationId,
        };
        const snapshot = await this.snapshot(ctx, op, tx);
        await tx.syncOperation.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: "conflict-resolver:" + ctx.userId, operationId: resolverOperationId, entityType, entityId: String(conflict.entity_id), operationType: "UPDATE", payload: effective, status: "PROCESSED", idempotencyKey: resolverOperationId, clientCreatedAt: new Date(), processedAt: new Date() } });
        revision = await this.journal(ctx, op, snapshot, "conflict-resolution", tx);
      }

      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "conflict-resolver:" + ctx.userId, action: "SYNC_CONFLICT_RESOLVED",
        entityType, entityId: String(conflict.entity_id),
        metadata: { conflictId, operationId: conflict.operation_id, resolution, resolutionOperationId: resolverOperationId,
          mergedPayload: resolution === "MERGE" ? mergedPayload : undefined },
      }});
      await tx.$executeRawUnsafe("UPDATE sync_conflict_record SET status = $1, resolved_at = now() WHERE id = $2 AND tenant_id = $3 AND branch_id = $4", resolution, conflictId, ctx.tenantId, ctx.branchId);
      return { status: "RESOLVED", operationId: resolverOperationId, revision };
    });
  }

  async listConflicts(ctx: TenantContext, status: string = "OPEN"): Promise<any[]> {
    await this.ensureInfrastructure();
    const rows = status === "ALL"
      ? await prisma.$queryRawUnsafe<any[]>("SELECT id, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, local_payload, remote_payload, status, created_at, resolved_at FROM sync_conflict_record WHERE tenant_id = $1 AND branch_id = $2 ORDER BY created_at DESC", ctx.tenantId, ctx.branchId)
      : await prisma.$queryRawUnsafe<any[]>("SELECT id, tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, local_payload, remote_payload, status, created_at, resolved_at FROM sync_conflict_record WHERE tenant_id = $1 AND branch_id = $2 AND status = $3 ORDER BY created_at DESC", ctx.tenantId, ctx.branchId, status);
    return rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, branchId: row.branch_id, operationId: row.operation_id, entityType: row.entity_type, entityId: row.entity_id, operationType: row.operation_type, localPayload: row.local_payload, remoteRecord: row.remote_payload, status: row.status, detectedAt: row.created_at, resolvedAt: row.resolved_at }));
  }

  async reconcileState(ctx: TenantContext, manifest: import("@kwakopos2/contracts").SyncStateManifest): Promise<import("@kwakopos2/contracts").SyncReconciliationResponse> {
    await this.ensureInfrastructure();
    return prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");

      const [serverProducts, serverVariants, serverLedger] = await Promise.all([
        tx.product.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, select: { id: true } }),
        tx.productVariant.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, select: { id: true, productId: true } }),
        tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, select: { id: true, variantId: true, quantityChange: true } }),
      ]);

    const discrepancies: import("@kwakopos2/contracts").SyncReconciliationDiscrepancy[] = [];
    const serverProductIds = new Set(serverProducts.map((row: any) => row.id));
    const compareIds = (entityType: string, serverIds: string[], clientIds: string[]) => {
      const serverSet = new Set(serverIds.map(String));
      const clientSet = new Set(clientIds.map(String));
      for (const id of serverSet) {
        if (!clientSet.has(id)) discrepancies.push({
          entityType,
          entityId: id,
          kind: "MISSING_ON_CLIENT",
          remediation: "Client replica is missing an authoritative record; execute bootstrap.",
        });
      }
      for (const id of clientSet) {
        if (!serverSet.has(id)) discrepancies.push({
          entityType,
          entityId: id,
          kind: "EXTRA_ON_CLIENT",
          remediation: "Client replica contains a record absent from the authoritative tenant/branch state; purge via bootstrap after resolving pending mutations.",
        });
      }
    };

    compareIds("Product", serverProducts.map((row: any) => row.id), manifest.productIds || []);
    compareIds("ProductVariant", serverVariants.map((row: any) => row.id), manifest.variantIds || []);
    compareIds("StockLedger", serverLedger.map((row: any) => row.id), manifest.ledgerIds || []);
    const serverExpenses = await tx.expense.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, select: { id: true } });
    compareIds("Expense", serverExpenses.map((row: any) => row.id), manifest.expenseIds || []);

    const serverBalances = new Map<string, number>();
    for (const row of serverLedger) {
      const variantId = String(row.variantId);
      serverBalances.set(variantId, (serverBalances.get(variantId) || 0) + Number(row.quantityChange || 0));
    }
    const clientBalances = manifest.stockBalances || {};
    const balanceVariantIds = new Set([...serverBalances.keys(), ...Object.keys(clientBalances)]);
    for (const variantId of balanceVariantIds) {
      const serverQty = Number(serverBalances.get(variantId) || 0);
      const clientQty = Number(clientBalances[variantId] || 0);
      if (Math.abs(serverQty - clientQty) > 0.0001) discrepancies.push({
        entityType: "StockBalance",
        entityId: variantId,
        kind: "STOCK_MISMATCH",
        serverValue: serverQty,
        clientValue: clientQty,
        remediation: "Client must rebuild stock balance from the authoritative Stock Ledger.",
      });
    }

    for (const variant of serverVariants) {
      if (!serverProductIds.has(variant.productId)) discrepancies.push({
        entityType: "ProductVariant",
        entityId: variant.id,
        kind: "ORPHANED_VARIANT",
        remediation: "Authoritative variant has no valid parent product in the same tenant/branch.",
      });
    }

    const serverCounts = {
      products: serverProducts.length,
      variants: serverVariants.length,
      stockLedger: serverLedger.length,
      expenses: serverExpenses.length,
    };
      const serverRevision = await this.latestRevision(ctx, tx);

      return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      evaluatedAt: new Date().toISOString(),
      serverRevision,
      inSync: discrepancies.length === 0,
      totalDiscrepancies: discrepancies.length,
      discrepancies,
      serverCounts,
      integrityChecksum: computePayloadChecksum({
        serverCounts,
        serverProducts: serverProducts.map((row: any) => row.id).sort(),
        serverVariants: serverVariants.map((row: any) => row.id).sort(),
        serverLedger: serverLedger.map((row: any) => row.id).sort(),
        serverBalances: Object.fromEntries([...serverBalances.entries()].sort()),
      }),
      };
    });
  }

  async processBootstrap(ctx: TenantContext, req: any): Promise<any> {
    await this.ensureInfrastructure();
    return prisma.$transaction(async (tx: any) => {
      // One repeatable snapshot: the revision cursor and all bootstrap rows refer to the same committed state.
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const snapshotRevision = await this.latestRevision(ctx, tx);
      const syncEpoch = await this.currentSyncEpoch(tx);
      const snapshotTimestamp = new Date().toISOString();

      const productRows = await tx.product.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { variants: true }, orderBy: { createdAt: "asc" } });
      const products = productRows.map(productShape);
      const parentPrices = new Map<string, { buyingPrice: number; sellingPrice: number }>(productRows.map((p: any) => [p.id, { buyingPrice: Number(p.buyingPrice ?? 0), sellingPrice: Number(p.sellingPrice ?? 0) }]));
      const variantsRaw = await tx.productVariant.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { createdAt: "asc" } });
      const variants = variantsRaw.map((v: any) => { const prices = parentPrices.get(v.productId) || { buyingPrice: 0, sellingPrice: 0 }; return variantShape(v, prices.buyingPrice, prices.sellingPrice); });
      const stockLedger = (await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { occurredAt: "asc" } })).map(ledgerShape);
      const adjustments = await tx.stockAdjustment.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { createdAt: "asc" } });
      const customers = await tx.customer.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { createdAt: "asc" } });
      const suppliers = await tx.supplier.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { createdAt: "asc" } });
      const categories = await tx.category.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { createdAt: "asc" } });
      const brands = await tx.brand.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { createdAt: "asc" } });
      const sales = await tx.sale.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true, payments: true }, orderBy: { soldAt: "asc" } });
      const payments = await tx.payment.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { paidAt: "asc" } });
      const purchaseReceipts = await tx.purchaseReceipt.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { items: true }, orderBy: { receivedAt: "asc" } });
      const priceHistories = await tx.productPriceHistory.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { effectiveFrom: "asc" } });
      const settings = await tx.setting.findMany({ where: { tenantId: ctx.tenantId, isActive: true, OR: [{ scope: "TENANT" }, { scope: "BRANCH", branchId: ctx.branchId }, { scope: "USER", userId: ctx.userId }] }, orderBy: { updatedAt: "asc" } });
      const expenses = (await tx.expense.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { incurredAt: "asc" } })).map(expenseShape);
      const payload = { products, variants, stockLedger, adjustments, customers, suppliers, categories, brands, sales, payments, purchaseReceipts, priceHistories, settings, expenses };
      const entityCounts = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
      return { tenantId: ctx.tenantId, branchId: ctx.branchId, snapshotTimestamp, serverRevision: snapshotRevision, syncEpoch, integrityChecksum: computePayloadChecksum(payload), schemaVersion: req.schemaVersion || 4, entityCounts, ...payload };
    });
  }
  async processDelta(ctx: TenantContext, req: SyncDeltaRequest): Promise<SyncDeltaResponse> {
    await this.ensureInfrastructure();
    await this.reconcileJournal(ctx);
    const syncEpoch = await this.currentSyncEpoch();
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
      if (afterRevision > 0n) {
        const minRevRows = await prisma.$queryRawUnsafe<Array<{ min_rev: bigint | number | string | null }>>(
          `SELECT MIN(revision) AS min_rev FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2`,
          ctx.tenantId, ctx.branchId,
        );
        const minRev = minRevRows[0]?.min_rev ? BigInt(minRevRows[0].min_rev) : 0n;
        if (minRev > 1n && afterRevision < minRev) {
          return {
            serverTimestamp: new Date().toISOString(),
            products: [], variants: [], stockLedger: [], adjustments: [], customers: [], suppliers: [], syncEpoch,
            serverRevision: String(afterRevision),
            changes: [],
            requiresBootstrap: true,
            compactionMinRevision: String(minRev),
          } as any;
        }
      }
      return { serverTimestamp: new Date().toISOString(), products: [], variants: [], stockLedger: [], adjustments: [], customers: [], suppliers: [], syncEpoch, ...( { serverRevision: String(lastDeliveredRevision), changes: normalizedChanges } as any ) } as any;
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
      priceHistories: (await prisma.productPriceHistory.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, createdAt: { gte: since, lte: anchor } } })).map((h: any) => ({ ...h, previousBuyingPrice: Number(h.previousBuyingPrice), newBuyingPrice: Number(h.newBuyingPrice), previousSellingPrice: Number(h.previousSellingPrice), newSellingPrice: Number(h.newSellingPrice), marginAmount: Number(h.marginAmount), marginPercentage: Number(h.marginPercentage) })),
      settings: (await prisma.setting.findMany({
        where: { tenantId: ctx.tenantId, updatedAt: { gte: since, lte: anchor }, OR: [{ scope: "TENANT" }, { scope: "BRANCH", branchId: ctx.branchId }, { scope: "USER", userId: ctx.userId }] },
        orderBy: { updatedAt: "asc" },
      })).map((row: any) => row.isActive === false ? { ...row, _deleted: true } : row),
      expenses: (await prisma.expense.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } }, orderBy: { incurredAt: "asc" } })).map(expenseShape),
      ...( { serverRevision: String(afterRevision), syncEpoch } as any ),
    } as any;
  }
  async getJournalCompactionStats(ctx?: CompactionScopeContext): Promise<JournalCompactionStats[]> {
    await this.ensureInfrastructure();
    let query: string;
    const params: any[] = [];

    if (ctx?.tenantId && ctx?.branchId) {
      query = `
        SELECT tenant_id, branch_id,
               COUNT(*)::text AS total_entries,
               MIN(revision)::text AS min_revision,
               MAX(revision)::text AS max_revision,
               MIN(created_at)::text AS oldest_entry_date,
               MAX(created_at)::text AS newest_entry_date
          FROM sync_change_journal
         WHERE tenant_id = $1 AND branch_id = $2
         GROUP BY tenant_id, branch_id
      `;
      params.push(ctx.tenantId, ctx.branchId);
    } else {
      query = `
        SELECT tenant_id, branch_id,
               COUNT(*)::text AS total_entries,
               MIN(revision)::text AS min_revision,
               MAX(revision)::text AS max_revision,
               MIN(created_at)::text AS oldest_entry_date,
               MAX(created_at)::text AS newest_entry_date
          FROM sync_change_journal
         GROUP BY tenant_id, branch_id
         ORDER BY tenant_id, branch_id
      `;
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      totalEntries: Number(r.total_entries || 0),
      minRevision: r.min_revision ? String(r.min_revision) : null,
      maxRevision: r.max_revision ? String(r.max_revision) : null,
      oldestEntryDate: r.oldest_entry_date ? new Date(r.oldest_entry_date).toISOString() : null,
      newestEntryDate: r.newest_entry_date ? new Date(r.newest_entry_date).toISOString() : null,
    }));
  }

  async compactJournal(
    ctx: CompactionScopeContext,
    options?: JournalCompactionOptions,
  ): Promise<JournalCompactionResult> {
    await this.ensureInfrastructure();
    const dryRun = Boolean(options?.dryRun);
    const retainRevisions = options?.retainRevisions ?? 5000;
    const maxAgeDays = options?.maxAgeDays;

    const statsList = await this.getJournalCompactionStats(ctx);
    const stats = statsList[0];
    if (!stats || stats.totalEntries === 0) {
      return {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        entriesExamined: 0,
        prunedCount: 0,
        safeRevisionThreshold: "0",
        retainedCount: 0,
        dryRun,
        compactedAt: new Date().toISOString(),
      };
    }

    const currentMaxRev = stats.maxRevision ? BigInt(stats.maxRevision) : 0n;
    let safeRevision: bigint;

    if (options?.beforeRevision) {
      const explicitRev = BigInt(options.beforeRevision);
      safeRevision = explicitRev < currentMaxRev ? explicitRev : currentMaxRev;
    } else {
      const retainBig = BigInt(retainRevisions);
      safeRevision = currentMaxRev > retainBig ? (currentMaxRev - retainBig + 1n) : 0n;
    }

    if (safeRevision <= 0n) {
      return {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        entriesExamined: stats.totalEntries,
        prunedCount: 0,
        safeRevisionThreshold: "0",
        retainedCount: stats.totalEntries,
        dryRun,
        compactedAt: new Date().toISOString(),
      };
    }

    let deleteSql = `FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2 AND revision < $3`;
    const params: any[] = [ctx.tenantId, ctx.branchId, safeRevision];

    if (typeof maxAgeDays === "number" && maxAgeDays > 0) {
      const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      deleteSql += ` AND created_at < $4`;
      params.push(cutoffDate);
    }

    const countRows = await prisma.$queryRawUnsafe<Array<{ count: string | bigint | number }>>(
      `SELECT COUNT(*)::text AS count ${deleteSql}`,
      ...params,
    );
    const prunedCount = Number(countRows[0]?.count || 0);

    if (!dryRun && prunedCount > 0) {
      await prisma.$executeRawUnsafe(`DELETE ${deleteSql}`, ...params);
    }

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      entriesExamined: stats.totalEntries,
      prunedCount,
      safeRevisionThreshold: String(safeRevision),
      retainedCount: stats.totalEntries - (dryRun ? 0 : prunedCount),
      dryRun,
      compactedAt: new Date().toISOString(),
    };
  }

  async compactAllJournals(options?: JournalCompactionOptions): Promise<JournalCompactionResult[]> {
    await this.ensureInfrastructure();
    const scopes = await prisma.$queryRawUnsafe<Array<{ tenant_id: string; branch_id: string }>>(
      `SELECT DISTINCT tenant_id, branch_id FROM sync_change_journal ORDER BY tenant_id, branch_id`,
    );
    const results: JournalCompactionResult[] = [];
    for (const scope of scopes) {
      const res = await this.compactJournal({ tenantId: scope.tenant_id, branchId: scope.branch_id }, options);
      results.push(res);
    }
    return results;
  }
}
