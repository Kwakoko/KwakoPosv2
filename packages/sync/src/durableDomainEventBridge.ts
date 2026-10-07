import { DomainEventBusEngine } from "@kwakopos2/domain";
import { createHash } from "node:crypto";
import type { DomainEventEnvelope, SyncPushRequest, TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";

type SyncOperation = SyncPushRequest["operations"][number];

function deterministicEventUuid(operationId: string, eventType: string): string {
  const digest = createHash("sha256").update(operationId + ":" + eventType).digest("hex").slice(0, 32).split("");
  digest[12] = "5";
  digest[16] = ["8", "9", "a", "b"][parseInt(digest[16], 16) % 4];
  const hex = digest.join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}
const ENGINE_BY_ENTITY: Record<string, string> = {
  Product: "core.product_catalog",
  ProductVariant: "core.product_catalog",
  Category: "core.product_catalog",
  Brand: "core.product_catalog",
  StockAdjustment: "core.stock_ledger",
  StockLedger: "core.stock_ledger",
  StockMovement: "core.stock_ledger",
  Sale: "core.sales_processing",
  Payment: "core.universal_payment",
  Customer: "core.party_contact",
  CustomerContact: "core.party_contact",
  Supplier: "core.party_contact",
};

export function domainEventTypeForOperation(entityType: string, operationType: string): string {
  const normalizedType = String(entityType || "Entity").replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  const normalizedOperation = String(operationType || "UPDATE").toUpperCase();
  const explicit: Record<string, string> = {
    "Product:CREATE": "PRODUCT_CREATED",
    "Product:UPDATE": "PRODUCT_UPDATED",
    "Product:DELETE": "PRODUCT_DELETED",
    "ProductVariant:CREATE": "PRODUCT_VARIANT_CREATED",
    "ProductVariant:UPDATE": "PRODUCT_VARIANT_UPDATED",
    "ProductVariant:DELETE": "PRODUCT_VARIANT_DELETED",
    "StockAdjustment:CREATE": "STOCK_MOVEMENT_RECORDED",
    "StockLedger:CREATE": "STOCK_MOVEMENT_RECORDED",
    "StockMovement:CREATE": "STOCK_MOVEMENT_RECORDED",
    "Sale:CREATE": "SALE_CREATED",
    "Sale:UPDATE": "SALE_UPDATED",
    "Sale:DELETE": "SALE_DELETED",
    "Payment:CREATE": "PAYMENT_PROCESSED",
    "Payment:UPDATE": "PAYMENT_UPDATED",
    "Payment:DELETE": "PAYMENT_DELETED",
    "Customer:CREATE": "CUSTOMER_CREATED",
    "Customer:UPDATE": "CUSTOMER_UPDATED",
    "Customer:DELETE": "CUSTOMER_DELETED",
    "CustomerContact:CREATE": "CUSTOMER_CONTACT_CREATED",
    "CustomerContact:UPDATE": "CUSTOMER_CONTACT_UPDATED",
    "CustomerContact:DELETE": "CUSTOMER_CONTACT_DELETED",
    "Supplier:CREATE": "SUPPLIER_CREATED",
    "Supplier:UPDATE": "SUPPLIER_UPDATED",
    "Supplier:DELETE": "SUPPLIER_DELETED",
    "PurchaseReceipt:CREATE": "PURCHASE_RECEIPT_CREATED",
    "Expense:CREATE": "EXPENSE_CREATED",
    "Expense:UPDATE": "EXPENSE_UPDATED",
    "Expense:DELETE": "EXPENSE_DELETED",
    "Category:CREATE": "CATEGORY_CREATED",
    "Category:UPDATE": "CATEGORY_UPDATED",
    "Category:DELETE": "CATEGORY_DELETED",
    "Brand:CREATE": "BRAND_CREATED",
    "Brand:UPDATE": "BRAND_UPDATED",
    "Brand:DELETE": "BRAND_DELETED",
    "Setting:CREATE": "SETTING_CREATED",
    "Setting:UPDATE": "SETTING_UPDATED",
    "Setting:DELETE": "SETTING_DELETED",
  };
  return explicit[`${entityType}:${normalizedOperation}`] || `${normalizedType}_${normalizedOperation}`;
}

export function buildDomainEvent(
  ctx: TenantContext,
  op: SyncOperation,
  record: unknown,
  revision: string | null,
  source = "sync",
): DomainEventEnvelope {
  const eventType = domainEventTypeForOperation(op.entityType, op.operationType);
  return {
    eventId: deterministicEventUuid(op.operationId, eventType),
    timestamp: new Date().toISOString(),
    eventType,
    engineId: ENGINE_BY_ENTITY[op.entityType] || "core.sync_gateway",
    aggregateType: op.entityType.toUpperCase(),
    aggregateId: op.entityId,
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    actorId: ctx.userId || "system",
    payload: {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      operationType: op.operationType,
      revision,
      record,
      payload: op.payload,
    },
    version: 1,
    correlationId: op.idempotencyKey,
    causationId: op.operationId,
  };
}

export async function ensureDurableDomainEventJournal(db: any = prisma): Promise<void> {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS domain_event_journal (
    event_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    engine_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    actor_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    correlation_id TEXT,
    causation_id TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'production',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
  )`);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS domain_event_journal_scope_event_uq
    ON domain_event_journal (tenant_id, branch_id, event_id)`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS domain_event_journal_scope_created_idx
    ON domain_event_journal (tenant_id, branch_id, created_at)`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS domain_event_journal_pending_idx
    ON domain_event_journal (tenant_id, branch_id, published_at, created_at)`);
}

export async function persistDomainEvent(
  db: any,
  event: DomainEventEnvelope,
  source = "production",
): Promise<void> {
  await ensureDurableDomainEventJournal(db);
  await db.$executeRawUnsafe(
    `INSERT INTO domain_event_journal
      (event_id, tenant_id, branch_id, event_type, engine_id, aggregate_type, aggregate_id, actor_id, version, correlation_id, causation_id, payload, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     ON CONFLICT (event_id) DO NOTHING`,
    event.eventId,
    event.tenantId,
    event.branchId || "",
    event.eventType,
    event.engineId,
    event.aggregateType,
    event.aggregateId,
    event.actorId || null,
    event.version,
    event.correlationId || null,
    event.causationId || null,
    JSON.stringify(event.payload || {}),
    source,
  );
}

export async function publishPendingDomainEvents(
  ctx: TenantContext,
  limit = 100,
): Promise<number> {
  await ensureDurableDomainEventJournal();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT event_id, tenant_id, branch_id, event_type, engine_id, aggregate_type, aggregate_id,
            actor_id, version, correlation_id, causation_id, payload, created_at
       FROM domain_event_journal
      WHERE tenant_id = $1
        AND branch_id = $2
        AND published_at IS NULL
      ORDER BY created_at ASC
      LIMIT $3`,
    ctx.tenantId,
    ctx.branchId,
    limit,
  );

  let delivered = 0;
  for (const row of rows) {
    const event: DomainEventEnvelope = {
      eventId: String(row.event_id),
      timestamp: new Date(row.created_at).toISOString(),
      eventType: String(row.event_type),
      engineId: String(row.engine_id),
      aggregateType: String(row.aggregate_type),
      aggregateId: String(row.aggregate_id),
      tenantId: String(row.tenant_id),
      branchId: String(row.branch_id),
      actorId: row.actor_id ? String(row.actor_id) : "system",
      payload: row.payload || {},
      version: Number(row.version || 1),
      correlationId: row.correlation_id ? String(row.correlation_id) : null,
      causationId: row.causation_id ? String(row.causation_id) : null,
    };
    await DomainEventBusEngine.getInstance().publish(event);
    await prisma.$executeRawUnsafe(
      `UPDATE domain_event_journal
          SET published_at = now()
        WHERE event_id = $1
          AND tenant_id = $2
          AND branch_id = $3
          AND published_at IS NULL`,
      event.eventId,
      ctx.tenantId,
      ctx.branchId,
    );
    delivered += 1;
  }
  return delivered;
}
