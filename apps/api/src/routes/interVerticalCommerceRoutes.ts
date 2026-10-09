import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  prisma, PrismaAtomicCommercialFinanceService, PricingAuthority, projectProductBranchStock,
  projectProductStockSummary, projectVariantInventory,
} from "@kwakopos2/database";
import { FinancialBridge, PricingTaxEngine } from "@kwakopos2/domain";
import { globalTraVfdService } from "../services/traVfdService.js";
import type { TenantContext } from "@kwakopos2/contracts";

type Ctx = TenantContext & { tenantId: string; branchId: string; userId: string };
type Item = {
  lineId: string; sellerVariantId: string; buyerVariantId: string | null; sku: string; name: string;
  requestedQuantity: number; proposedUnitPrice: number; acceptedQuantity: number | null;
  unitPrice: number | null; dispatchedQuantity: number; receivedQuantity: number;
  dispatchAllocations?: DispatchAllocation[];
};
type DispatchAllocation = {
  shipmentId: string; quantity: number; receivedQuantity: number; unitPrice: number;
  taxRatePct: number; taxInclusive: boolean; netAmount: number; taxAmount: number; grossAmount: number;
  receivedNetAmount: number; receivedTaxAmount: number; receivedGrossAmount: number;
  sellerInvoiceId: string; sellerInvoiceNumber: string;
};
type ReceivePortion = {
  item: Item; quantity: number; variant: any; batchNumber?: string; expiryDate?: string;
  shipmentId: string; unitPrice: number; taxRatePct: number; taxInclusive: boolean;
  netAmount: number; taxAmount: number; grossAmount: number;
};
type OrderRow = Record<string, any> & { items: Item[] };
const db: any = prisma;
const finance = new PrismaAtomicCommercialFinanceService();
let schemaReady: Promise<void> | null = null;

const LinkCreate = z.object({ sellerTenantId: z.string().trim().min(1), notes: z.string().trim().max(1000).optional().default(""), idempotencyKey: z.string().trim().min(8).max(200) });
const LinkResponse = z.object({ action: z.enum(["ACCEPT", "REJECT"]), reason: z.string().trim().max(1000).optional().default(""), creditLimit: z.number().positive().finite().optional(), idempotencyKey: z.string().trim().min(8).max(200) });
const OrderCreate = z.object({
  connectionId: z.string().trim().min(1), notes: z.string().trim().max(2000).optional().default(""),
  currency: z.string().trim().length(3).optional().default("TZS"), idempotencyKey: z.string().trim().min(8).max(200),
  items: z.array(z.object({ sellerVariantId: z.string().trim().min(1), buyerVariantId: z.string().trim().min(1).optional(), quantity: z.number().positive().finite() })).min(1).max(100),
});
const OrderRespond = z.object({
  action: z.enum(["ACCEPT", "REJECT"]), reason: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(8).max(200),
  items: z.array(z.object({ lineId: z.string().trim().min(1), quantity: z.number().positive().finite(), unitPrice: z.number().positive().finite(), priceOverrideReason: z.string().trim().min(3).max(500).optional() })).optional(),
});
const Dispatch = z.object({
  idempotencyKey: z.string().trim().min(8).max(200), carrierName: z.string().trim().max(200).optional().default(""),
  trackingNumber: z.string().trim().max(200).optional().default(""), eta: z.string().datetime().optional(),
  items: z.array(z.object({ lineId: z.string().trim().min(1), quantity: z.number().positive().finite() })).min(1).max(100),
});
const Transit = z.object({ idempotencyKey: z.string().trim().min(8).max(200), carrierName: z.string().trim().max(200).optional(), trackingNumber: z.string().trim().max(200).optional(), eta: z.string().datetime().optional() });
const Receive = z.object({
  idempotencyKey: z.string().trim().min(8).max(200), notes: z.string().trim().max(1000).optional().default(""),
  items: z.array(z.object({ lineId: z.string().trim().min(1), buyerVariantId: z.string().trim().min(1).optional(), quantity: z.number().positive().finite(), batchNumber: z.string().trim().max(200).optional(), expiryDate: z.string().datetime().optional() })).min(1).max(100),
});
const PaymentRequest = z.object({
  idempotencyKey: z.string().trim().min(8).max(200), amount: z.number().positive().finite(),
  paymentMethod: z.enum(["BANK", "MOBILE_MONEY"]).default("BANK"),
  provider: z.string().trim().max(100).optional(), providerReference: z.string().trim().max(200).optional(), notes: z.string().trim().max(1000).optional().default(""),
});

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = [
      "CREATE TABLE IF NOT EXISTS inter_vertical_connections (id TEXT PRIMARY KEY, buyer_tenant_id TEXT NOT NULL, buyer_branch_id TEXT NOT NULL, seller_tenant_id TEXT NOT NULL, seller_branch_id TEXT, buyer_supplier_id TEXT, seller_customer_id TEXT, status TEXT NOT NULL DEFAULT 'PENDING', requested_by_user_id TEXT NOT NULL, accepted_by_user_id TEXT, notes TEXT NOT NULL DEFAULT '', idempotency_key TEXT NOT NULL, seller_response_idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (buyer_tenant_id, buyer_branch_id, idempotency_key))",
      "CREATE UNIQUE INDEX IF NOT EXISTS inter_vertical_connections_active_pair_uq ON inter_vertical_connections (buyer_tenant_id, buyer_branch_id, seller_tenant_id, seller_branch_id) WHERE status = 'ACTIVE'",
      "CREATE INDEX IF NOT EXISTS inter_vertical_connections_buyer_idx ON inter_vertical_connections (buyer_tenant_id, buyer_branch_id, status)",
      "CREATE INDEX IF NOT EXISTS inter_vertical_connections_seller_idx ON inter_vertical_connections (seller_tenant_id, seller_branch_id, status)",
      "CREATE UNIQUE INDEX IF NOT EXISTS inter_vertical_connections_seller_response_uq ON inter_vertical_connections (seller_tenant_id, seller_branch_id, seller_response_idempotency_key) WHERE seller_response_idempotency_key IS NOT NULL",
      "CREATE TABLE IF NOT EXISTS inter_vertical_orders (id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, connection_id TEXT NOT NULL, buyer_purchase_order_id TEXT, buyer_tenant_id TEXT NOT NULL, buyer_branch_id TEXT NOT NULL, seller_tenant_id TEXT NOT NULL, seller_branch_id TEXT NOT NULL, buyer_supplier_id TEXT NOT NULL, seller_customer_id TEXT NOT NULL, status TEXT NOT NULL, finance_status TEXT NOT NULL DEFAULT 'OPEN', currency TEXT NOT NULL DEFAULT 'TZS', items JSONB NOT NULL DEFAULT '[]'::jsonb, logistics JSONB NOT NULL DEFAULT '{}'::jsonb, total_amount NUMERIC(14,2) NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', rejection_reason TEXT, created_by_user_id TEXT NOT NULL, accepted_by_user_id TEXT, idempotency_key TEXT NOT NULL, settled_amount NUMERIC(14,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (buyer_tenant_id, buyer_branch_id, idempotency_key))",
      "ALTER TABLE inter_vertical_orders ADD COLUMN IF NOT EXISTS buyer_purchase_order_id TEXT",
      "CREATE INDEX IF NOT EXISTS inter_vertical_orders_buyer_idx ON inter_vertical_orders (buyer_tenant_id, buyer_branch_id, status, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS inter_vertical_orders_seller_idx ON inter_vertical_orders (seller_tenant_id, seller_branch_id, status, created_at DESC)",
      "CREATE TABLE IF NOT EXISTS inter_vertical_order_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT, idempotency_key TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, branch_id, idempotency_key))",
      "CREATE INDEX IF NOT EXISTS inter_vertical_order_events_order_idx ON inter_vertical_order_events (order_id, created_at)",
      "CREATE TABLE IF NOT EXISTS inter_vertical_finance_documents (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, side TEXT NOT NULL CHECK (side IN ('BUYER','SELLER')), document_type TEXT NOT NULL, document_id TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (side, document_type, document_id))",
      "CREATE INDEX IF NOT EXISTS inter_vertical_finance_documents_order_idx ON inter_vertical_finance_documents (order_id, side, created_at)",
      "CREATE TABLE IF NOT EXISTS inter_vertical_payment_requests (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, submitted_by_user_id TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, payment_method TEXT NOT NULL, provider TEXT, provider_reference TEXT, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION', idempotency_key TEXT NOT NULL, buyer_payment_id TEXT, seller_payment_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), confirmed_at TIMESTAMPTZ, UNIQUE (tenant_id, branch_id, idempotency_key))",
      "CREATE INDEX IF NOT EXISTS inter_vertical_payment_requests_order_idx ON inter_vertical_payment_requests (order_id, status, created_at)",
      "CREATE TABLE IF NOT EXISTS supply_chain_shipments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, po_id TEXT NOT NULL, supplier_id TEXT NOT NULL, gateway_order_id TEXT, source_tenant_id TEXT, source_branch_id TEXT, carrier_name TEXT NOT NULL, tracking_number TEXT, status TEXT NOT NULL CHECK (status IN ('PLANNED','CONFIRMED','IN_TRANSIT','ARRIVED','RECEIVING','RECEIVED','EXCEPTION','CANCELLED')), supplier_eta TIMESTAMPTZ NOT NULL, carrier_eta TIMESTAMPTZ, actual_arrival_date TIMESTAMPTZ, destination_warehouse_id TEXT, created_by_user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, branch_id, idempotency_key))",
      "CREATE INDEX IF NOT EXISTS supply_chain_shipments_gateway_order_idx ON supply_chain_shipments (tenant_id, branch_id, gateway_order_id, created_at)",
      "CREATE INDEX IF NOT EXISTS supply_chain_shipments_po_idx ON supply_chain_shipments (tenant_id, branch_id, po_id, status)",
      "CREATE TABLE IF NOT EXISTS supply_chain_shipment_lines (id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, gateway_line_id TEXT, seller_variant_id TEXT, buyer_variant_id TEXT, product_id TEXT, sku TEXT NOT NULL, description TEXT NOT NULL, quantity_shipped NUMERIC(12,4) NOT NULL CHECK (quantity_shipped > 0), quantity_received NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_shipped), unit_price NUMERIC(14,2) NOT NULL DEFAULT 0, net_amount NUMERIC(14,2) NOT NULL DEFAULT 0, tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0, tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE, tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0, gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), FOREIGN KEY (shipment_id) REFERENCES supply_chain_shipments(id) ON DELETE CASCADE)",
      "CREATE INDEX IF NOT EXISTS supply_chain_shipment_lines_shipment_idx ON supply_chain_shipment_lines (shipment_id)",
      "CREATE INDEX IF NOT EXISTS supply_chain_shipment_lines_gateway_line_idx ON supply_chain_shipment_lines (gateway_line_id)",
      "CREATE TABLE IF NOT EXISTS supply_chain_shipment_events (id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL REFERENCES supply_chain_shipments(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, branch_id, idempotency_key))",
      "CREATE INDEX IF NOT EXISTS supply_chain_shipment_events_shipment_idx ON supply_chain_shipment_events (shipment_id, created_at)",
    ];
    for (const statement of sql) await db.$executeRawUnsafe(statement);
  })().catch((err) => { schemaReady = null; throw err; });
  return schemaReady;
}
function ctxOf(req: FastifyRequest): Ctx {
  const c = (req as any).tenantContext;
  if (!c?.tenantId || !c?.branchId || !c?.userId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
  return c as Ctx;
}
function permission(ctx: Ctx, ...names: string[]): void {
  const roles = (ctx.roles || []).map((v: unknown) => String(v).trim().toUpperCase());
  const permissions = new Set((ctx.permissions || []).map((v: unknown) => String(v).trim().toLowerCase()));
  const permissionMatches = names.some((name) => {
    const normalized = name.trim().toLowerCase();
    return permissions.has(normalized)
      || permissions.has(normalized.replace(/[.-]/g, "_"))
      || permissions.has(normalized.replace(/_/g, "."));
  });
  if (roles.some((r: string) => ["OWNER","ADMIN","SUPER_ADMIN","SUPERADMIN","MANAGER","BRANCH_MANAGER"].includes(r)) || permissions.has("*") || permissions.has("admin:*") || permissionMatches) return;
  throw new Error("FORBIDDEN: Required business permission is missing");
}
function itemsOf(row: any): Item[] {
  if (Array.isArray(row?.items)) return row.items as Item[];
  if (typeof row?.items === "string") { try { return JSON.parse(row.items); } catch { return []; } }
  return [];
}
function orderDto(row: any): Record<string, any> {
  return {
    id: row.id, orderNumber: row.order_number, connectionId: row.connection_id,
    buyerPurchaseOrderId: row.buyer_purchase_order_id || null, buyerTenantId: row.buyer_tenant_id, buyerBranchId: row.buyer_branch_id,
    sellerTenantId: row.seller_tenant_id, sellerBranchId: row.seller_branch_id,
    buyerSupplierId: row.buyer_supplier_id, sellerCustomerId: row.seller_customer_id,
    status: row.status, financeStatus: row.finance_status, currency: row.currency,
    items: itemsOf(row), logistics: row.logistics || {}, totalAmount: Number(row.total_amount || 0),
    settledAmount: Number(row.settled_amount || 0), notes: row.notes || "",
    rejectionReason: row.rejection_reason || null, createdByUserId: row.created_by_user_id,
    acceptedByUserId: row.accepted_by_user_id || null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function httpStatus(err: unknown): number {
  const m = err instanceof Error ? err.message : String(err);
  if (m.startsWith("FORBIDDEN")) return 403;
  if (m.includes("NOT_FOUND") || m.includes("NOT_LINKED") || m.includes("CONNECTION_NOT_FOUND")) return 404;
  if (m.includes("CONFLICT") || m.includes("INVALID_STATUS") || m.includes("ALREADY_") || m.includes("IDEMPOTENCY") || m.includes("UNIQUE") || m.includes("P2002")) return 409;
  if (m.includes("INSUFFICIENT") || m.includes("EXCEEDS_") || m.includes("BOUNDARY") || m.includes("MAPPING_REQUIRED") || m.includes("CREDIT_LIMIT")) return 422;
  if (m.includes("TENANT_BRANCH_CONTEXT_REQUIRED") || m.includes("UNAUTHORIZED")) return 401;
  if (m.includes("INVALID") || m.includes("REQUIRED") || m.includes("MISSING") || m.includes("DUPLICATE") || m.includes("CANNOT_")) return 400;
  return 500;
}
function errorReply(reply: FastifyReply, err: unknown) {
  const m = err instanceof Error ? err.message : "INTER_VERTICAL_GATEWAY_FAILED";
  const code = m.split(":")[0].replace(/[^A-Za-z0-9_]/g, "_").slice(0, 80) || "INTER_VERTICAL_GATEWAY_FAILED";
  return reply.status(httpStatus(err)).send({ success: false, error: { code, message: httpStatus(err) >= 500 ? "Inter-Vertical Commerce Gateway operation failed" : m } });
}
async function event(tx: any, orderId: string, ctx: Ctx, action: string, from: string | null, to: string | null, key: string, payload: unknown = {}): Promise<void> {
  await tx.$executeRawUnsafe(
    "INSERT INTO inter_vertical_order_events (id,order_id,tenant_id,branch_id,actor_user_id,action,from_status,to_status,idempotency_key,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
    randomUUID(), orderId, ctx.tenantId, ctx.branchId, ctx.userId, action, from, to, key, JSON.stringify(payload || {}),
  );
}
async function orderFor(tx: any, id: string, ctx: Ctx, side?: "BUYER" | "SELLER", lock = false): Promise<any[]> {
  const where = side === "BUYER" ? "buyer_tenant_id=$2 AND buyer_branch_id=$3"
    : side === "SELLER" ? "seller_tenant_id=$2 AND seller_branch_id=$3"
      : "((buyer_tenant_id=$2 AND buyer_branch_id=$3) OR (seller_tenant_id=$2 AND seller_branch_id=$3))";
  return tx.$queryRawUnsafe("SELECT * FROM inter_vertical_orders WHERE id=$1 AND " + where + (lock ? " FOR UPDATE" : ""), id, ctx.tenantId, ctx.branchId);
}
async function replayEvent(tx: any, ctx: Ctx, key: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe("SELECT id FROM inter_vertical_order_events WHERE tenant_id=$1 AND branch_id=$2 AND idempotency_key=$3", ctx.tenantId, ctx.branchId, key);
  return rows.length > 0;
}
async function ledgerQty(tx: any, tenantId: string, branchId: string, variantId: string): Promise<number> {
  const r = await tx.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId, branchId, variantId } });
  return Number(r?._sum?.quantityChange || 0);
}
async function stockMove(tx: any, ctx: Ctx, variant: any, delta: number, orderId: string, key: string, movement: string): Promise<void> {
  await tx.$queryRawUnsafe('SELECT id FROM product_variants WHERE id=$1 AND "tenantId"=$2 AND "branchId"=$3 FOR UPDATE', variant.id, ctx.tenantId, ctx.branchId);
  const before = await ledgerQty(tx, ctx.tenantId, ctx.branchId, variant.id);
  if (before < 0) throw new Error("STOCK_LEDGER_INVARIANT_VIOLATION");
  if (delta < 0 && before + delta < 0) throw new Error("INSUFFICIENT_STOCK");
  const now = new Date(), cost = Number(variant.costPrice || 0);
  await tx.stockLedger.create({ data: {
    id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
    movementType: movement, referenceType: "INTER_VERTICAL_ORDER", referenceId: orderId,
    quantityBefore: before, quantityChange: delta, quantity: delta, quantityAfter: before + delta,
    unitCost: cost, totalCost: Math.abs(delta) * cost, userId: ctx.userId, deviceId: "inter-vertical-gateway",
    operationId: "ivg-" + key, idempotencyKey: "ivg-" + key, notes: "Inter-Vertical order " + orderId,
    synced: true, occurredAt: now,
  } });
  await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, variant.id);
  await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, variant.id, null);
  await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
}
async function patchOrder(tx: any, id: string, patch: Record<string, any>): Promise<any> {
  const fields: string[] = [], values: any[] = [id];
  const add = (col: string, value: any, cast = "") => { values.push(value); fields.push('"' + col + '"=$' + values.length + cast); };
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.finance_status !== undefined) add("finance_status", patch.finance_status);
  if (patch.items !== undefined) add("items", JSON.stringify(patch.items), "::jsonb");
  if (patch.total_amount !== undefined) add("total_amount", patch.total_amount);
  if (patch.logistics !== undefined) add("logistics", JSON.stringify(patch.logistics), "::jsonb");
  if (patch.rejection_reason !== undefined) add("rejection_reason", patch.rejection_reason);
  if (patch.accepted_by_user_id !== undefined) add("accepted_by_user_id", patch.accepted_by_user_id);
  if (patch.settled_amount !== undefined) add("settled_amount", patch.settled_amount);
  values.push(new Date()); fields.push('"updated_at"=$' + values.length);
  const rows = await tx.$queryRawUnsafe("UPDATE inter_vertical_orders SET " + fields.join(",") + " WHERE id=$1 RETURNING *", ...values);
  return rows[0];
}
function tenantCtx(base: Ctx, tenantId: string, branchId: string, userId: string): Ctx { return { ...base, tenantId, branchId, userId } as Ctx; }

type BranchTaxAuthority = {
  vatEnabled: boolean;
  taxCode: string;
  taxName: string;
  config: { ratePct: number; isInclusive: boolean };
};

async function resolveBranchTaxAuthority(tx: any, ctx: Ctx): Promise<BranchTaxAuthority> {
  const settings = await tx.setting.findMany({
    where: { tenantId: ctx.tenantId, branchId: ctx.branchId, scope: "BRANCH", key: "tax.config", isActive: true },
    orderBy: { updatedAt: "desc" }, take: 1,
  });
  const value = (settings[0]?.value || {}) as any;
  const vatEnabled = Boolean(value.vatEnabled);
  const taxCode = String(value.taxCode || "VAT").trim().toUpperCase();
  const taxName = String(value.taxName || "VAT");
  let tax: any = null;
  if (vatEnabled) {
    const taxId = typeof value.taxId === "string" ? value.taxId : "";
    tax = taxId ? await tx.tax.findFirst({
      where: { id: taxId, tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true },
    }) : null;
    if (!tax) tax = await tx.tax.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, code: taxCode, isActive: true },
    });
    if (!tax) {
      const rate = Number(value.vatRatePercent ?? 0);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("SALE_TAX_RATE_INVALID");
      tax = await tx.tax.upsert({
        where: { tenantId_branchId_code: { tenantId: ctx.tenantId, branchId: ctx.branchId, code: taxCode } },
        create: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, name: taxName, code: taxCode, rate,
          isInclusive: value.taxInclusivePricing !== false, isActive: true,
        },
        update: { name: taxName, rate, isInclusive: value.taxInclusivePricing !== false, isActive: true },
      });
    }
  }
  const ratePct = vatEnabled && tax ? Number(tax.rate) : 0;
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) throw new Error("SALE_TAX_RATE_INVALID");
  return {
    vatEnabled, taxCode, taxName,
    config: { ratePct, isInclusive: tax ? Boolean(tax.isInclusive) : true },
  };
}
async function addFinanceDoc(tx: any, order: any, ctx: Ctx, side: "BUYER" | "SELLER", type: string, documentId: string, amount: number): Promise<void> {
  await tx.$executeRawUnsafe(
    "INSERT INTO inter_vertical_finance_documents (id,order_id,tenant_id,branch_id,side,document_type,document_id,amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    randomUUID(), order.id, ctx.tenantId, ctx.branchId, side, type, documentId, amount,
  );
}
async function sellerInvoice(
  tx: any, ctx: Ctx, order: any,
  dispatch: Array<{ item: Item; quantity: number; variant: any }>,
  key: string, shipmentId: string,
): Promise<{
  sale: any; invoice: any; amount: number; taxAmount: number;
  fiscalizationId: string | null; fiscalizationState: string;
  allocations: Array<{ item: Item; variant: any; allocation: DispatchAllocation }>;
}> {
  const now = new Date();
  const customer = await tx.customer.findFirst({
    where: { id: order.seller_customer_id, tenantId: ctx.tenantId, branchId: ctx.branchId },
  });
  if (!customer) throw new Error("COUNTERPARTY_FINANCE_MAPPING_NOT_FOUND");
  const tax = await resolveBranchTaxAuthority(tx, ctx);
  const lineBuilds = dispatch.map((x) => ({
    ...x,
    calculated: PricingTaxEngine.calculateLineItem({
      unitPrice: Number(x.item.unitPrice || 0),
      unitCost: Number(x.variant.costPrice || 0),
      quantity: x.quantity,
      taxConfig: tax.config,
    }),
  }));
  const totals = PricingTaxEngine.calculateSaleTotals(
    lineBuilds.map((x) => ({
      lineTotal: x.calculated.lineTotal,
      totalCost: x.calculated.totalCost,
      discountAmount: x.calculated.discountAmount,
      taxAmount: x.calculated.taxAmount,
    })),
    0,
    tax.config,
  );
  if (totals.grandTotal <= 0) throw new Error("ORDER_TOTAL_INVALID");
  const netRevenue = Math.max(0, Number(totals.grandTotal) - Number(totals.taxTotal));
  const totalCost = Number(totals.totalCost);
  if (Number(customer.currentBalance || 0) + Number(totals.grandTotal) > Number(customer.creditLimit || 0) + 0.005) {
    throw new Error("SELLER_CREDIT_LIMIT_EXCEEDED");
  }
  const saleNumber = "IVS-" + now.toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + randomUUID().slice(0,8).toUpperCase();
  const sale = await tx.sale.create({ data: {
    id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, saleNumber,
    customerId: customer.id, subtotal: netRevenue, discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal, grandTotal: totals.grandTotal, totalCost,
    grossProfit: netRevenue - totalCost, status: "COMPLETED", paymentStatus: "UNPAID",
    deviceId: "inter-vertical-gateway", operationId: "ivg-" + key,
    idempotencyKey: "ivg-sale-" + key, soldById: ctx.userId, soldAt: now,
    lines: { create: lineBuilds.map((x) => ({
      id: randomUUID(), productId: x.variant.productId, variantId: x.variant.id, quantity: x.quantity,
      unitPrice: Number(x.item.unitPrice), unitCost: Number(x.variant.costPrice || 0),
      discountAmount: x.calculated.discountAmount, taxAmount: x.calculated.taxAmount,
      lineTotal: x.calculated.lineTotal,
    })) },
  }, include: { lines: true } });
  const invoiceNumber = "IVI-" + now.toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + randomUUID().slice(0,8).toUpperCase();
  const invoice = await tx.customerInvoice.create({ data: {
    id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, customerId: customer.id, saleId: sale.id,
    invoiceNumber, invoiceDate: now, dueDate: new Date(now.getTime() + 30 * 86400000),
    subtotal: netRevenue, taxTotal: totals.taxTotal, discountTotal: totals.discountTotal,
    grandTotal: totals.grandTotal, amountPaid: 0, balanceDue: totals.grandTotal, status: "ISSUED",
    notes: "Inter-Vertical Order " + order.order_number + "; TRA fiscalization is queued separately",
    lines: { create: lineBuilds.map((x) => ({
      id: randomUUID(), variantId: x.variant.id, description: x.item.name || x.item.sku,
      quantity: x.quantity, unitPrice: Number(x.item.unitPrice),
      taxRate: tax.config.ratePct, taxAmount: x.calculated.taxAmount,
      discountAmount: x.calculated.discountAmount, lineTotal: x.calculated.lineTotal,
    })) },
  } });
  await tx.customer.update({
    where: { id: customer.id }, data: { currentBalance: { increment: Number(totals.grandTotal) } },
  });
  const accounts = await finance.accounts(tx, ctx);
  const built = FinancialBridge.mapSaleToJournal(
    ctx as any, sale as any, accounts as any, "CREDIT",
    (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1,
  );
  await finance.writeJournal(tx, ctx as any, built);
  await addFinanceDoc(tx, order, ctx, "SELLER", "CUSTOMER_INVOICE", invoice.id, Number(totals.grandTotal));

  let fiscalizationId: string | null = null, fiscalizationState = "DISABLED";
  const vfdConfig = await tx.traVfdConfig.findUnique({
    where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } },
    select: { enabled: true },
  });
  if (vfdConfig?.enabled) {
    const fiscal = await globalTraVfdService.enqueueInTransaction(tx, ctx, {
      transactionId: invoice.id,
      deviceId: "inter-vertical-gateway",
      payload: {
        invoiceNumber, receiptNumber: invoiceNumber, createdAt: now.toISOString(),
        customerId: customer.id, customerName: customer.name || "B2B CUSTOMER",
        customerMobile: customer.phone || "", customerIdType: 6,
        orderNumber: order.order_number, sourceType: "INTER_VERTICAL_B2B",
        currency: order.currency || "TZS",
        items: lineBuilds.map((x) => ({
          id: x.item.sku, productId: x.variant.productId, variantId: x.variant.id,
          description: x.item.name || x.item.sku, quantity: x.quantity,
          unitPrice: Number(x.item.unitPrice), discountAmount: x.calculated.discountAmount,
          taxRate: tax.config.ratePct, taxAmount: x.calculated.taxAmount,
          lineTotal: x.calculated.lineTotal,
        })),
        subtotal: netRevenue, taxRatePct: tax.config.ratePct, taxInclusive: tax.config.isInclusive,
        taxTotal: totals.taxTotal, grandTotal: totals.grandTotal, paidAmount: 0,
        paymentMethod: "CREDIT", paymentStatus: "UNPAID",
      },
    });
    fiscalizationId = fiscal.id; fiscalizationState = fiscal.state;
  }

  const allocations = lineBuilds.map((x) => ({
    item: x.item,
    variant: x.variant,
    allocation: {
      shipmentId, quantity: x.quantity, receivedQuantity: 0, unitPrice: Number(x.item.unitPrice),
      taxRatePct: tax.config.ratePct, taxInclusive: tax.config.isInclusive,
      netAmount: Math.round((Number(x.calculated.lineTotal) - Number(x.calculated.taxAmount)) * 100) / 100,
      taxAmount: Number(x.calculated.taxAmount), grossAmount: Number(x.calculated.lineTotal),
      receivedNetAmount: 0, receivedTaxAmount: 0, receivedGrossAmount: 0,
      sellerInvoiceId: invoice.id, sellerInvoiceNumber: invoiceNumber,
    } satisfies DispatchAllocation,
  }));
  return {
    sale, invoice, amount: Number(totals.grandTotal), taxAmount: Number(totals.taxTotal),
    fiscalizationId, fiscalizationState, allocations,
  };
}
async function buyerReceipt(
  tx: any, ctx: Ctx, order: any, supplierId: string, purchaseOrderId: string,
  receives: ReceivePortion[], key: string, notes: string,
): Promise<{ receipt: any; supplierInvoice: any; amount: number; taxAmount: number }> {
  const now = new Date();
  const netAmount = receives.reduce((sum, x) => sum + x.netAmount, 0);
  const taxAmount = receives.reduce((sum, x) => sum + x.taxAmount, 0);
  const grossAmount = receives.reduce((sum, x) => sum + x.grossAmount, 0);
  if (grossAmount <= 0 || Math.abs(grossAmount - netAmount - taxAmount) > 0.03) {
    throw new Error("PURCHASE_TAX_TOTAL_MISMATCH");
  }
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, tenantId: ctx.tenantId, branchId: ctx.branchId },
  });
  if (!supplier) throw new Error("COUNTERPARTY_FINANCE_MAPPING_NOT_FOUND");
  const buyerTax = await resolveBranchTaxAuthority(tx, ctx);
  const recoverInputTax = buyerTax.vatEnabled;
  const inventoryValue = recoverInputTax ? netAmount : grossAmount;
  const receiptItems = receives.map((x) => {
    const value = recoverInputTax ? x.netAmount : x.grossAmount;
    return {
      id: randomUUID(), variantId: x.variant.id, quantityReceived: x.quantity,
      unitCost: value / x.quantity, totalCost: value,
      batchNumber: x.batchNumber || null, expiryDate: x.expiryDate ? new Date(x.expiryDate) : null,
    };
  });
  const receipt = await tx.purchaseReceipt.create({ data: {
    id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId,
    receiptNumber: "IVR-" + now.toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + randomUUID().slice(0,8).toUpperCase(),
    purchaseOrderId, supplierId, receivedAt: now, createdById: ctx.userId,
    notes: [notes, "Inter-Vertical Order " + order.order_number].filter(Boolean).join(" | "),
    items: { create: receiptItems },
  }, include: { items: true } });
  const invoiceNumber = "IVSI-" + now.toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + randomUUID().slice(0,8).toUpperCase();
  const supplierInvoice = await tx.supplierInvoice.create({ data: {
    id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, supplierId,
    purchaseReceiptId: receipt.id, invoiceNumber, invoiceDate: now, dueDate: new Date(now.getTime() + 30 * 86400000),
    subtotal: netAmount, taxTotal: taxAmount, grandTotal: grossAmount, amountPaid: 0, balanceDue: grossAmount,
    status: "RECEIVED",
    notes: "Seller invoices: " + Array.from(new Set(receives.map((x) => x.item.dispatchAllocations?.find((a) => a.shipmentId === x.shipmentId)?.sellerInvoiceNumber).filter(Boolean))).join(", ") + "; Inter-Vertical Order " + order.order_number,
    lines: { create: receives.map((x) => ({
      id: randomUUID(), variantId: x.variant.id, description: x.item.name || x.item.sku,
      quantity: x.quantity, unitCost: x.netAmount / x.quantity, taxRate: x.taxRatePct,
      taxAmount: x.taxAmount, lineTotal: x.grossAmount,
    })) },
  } });
  await tx.supplier.update({
    where: { id: supplierId }, data: { outstandingBalance: { increment: grossAmount } },
  });

  for (const entry of receives) {
    const updated = await tx.$queryRawUnsafe(
      "UPDATE supply_chain_shipment_lines SET quantity_received=quantity_received+$2, updated_at=now() WHERE shipment_id=$1 AND gateway_line_id=$3 AND quantity_received+$2<=quantity_shipped RETURNING id",
      entry.shipmentId, entry.quantity, entry.item.lineId,
    );
    if (!updated.length) throw new Error("SHIPMENT_RECEIPT_QUANTITY_MISMATCH");
  }
  await tx.$executeRawUnsafe(
    "UPDATE supply_chain_shipments AS s SET status=CASE WHEN NOT EXISTS (SELECT 1 FROM supply_chain_shipment_lines AS l WHERE l.shipment_id=s.id AND l.quantity_received<l.quantity_shipped) THEN 'RECEIVED' WHEN EXISTS (SELECT 1 FROM supply_chain_shipment_lines AS l WHERE l.shipment_id=s.id AND l.quantity_received>0) THEN 'RECEIVING' ELSE s.status END, actual_arrival_date=COALESCE(s.actual_arrival_date,now()), updated_at=now() WHERE s.tenant_id=$1 AND s.branch_id=$2 AND s.gateway_order_id=$3",
    ctx.tenantId, ctx.branchId, order.id,
  );

  const accounts = await finance.accounts(tx, ctx);
  const built = FinancialBridge.mapGoodsReceiptToJournal(
    ctx as any,
    { ...receipt, items: receipt.items.map((x: any) => ({ ...x, totalCost: Number(x.totalCost) })) } as any,
    accounts as any,
    (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1,
    { inputTaxAmount: recoverInputTax ? taxAmount : 0, grossPayable: grossAmount },
  );
  await finance.writeJournal(tx, ctx as any, built);
  await addFinanceDoc(tx, order, ctx, "BUYER", "SUPPLIER_INVOICE", supplierInvoice.id, grossAmount);
  return { receipt, supplierInvoice, amount: grossAmount, taxAmount };
}
async function openFinance(tx: any, orderId: string, side: "BUYER" | "SELLER"): Promise<number> {
  const r = await tx.$queryRawUnsafe("SELECT COALESCE(SUM(amount-paid_amount),0) AS amount FROM inter_vertical_finance_documents WHERE order_id=$1 AND side=$2", orderId, side);
  return Number(r[0]?.amount || 0);
}
async function financeStatus(tx: any, order: any, settled: number): Promise<string> {
  const buyer = await openFinance(tx, order.id, "BUYER"), seller = await openFinance(tx, order.id, "SELLER");
  const isComplete = itemsOf(order).length > 0 && itemsOf(order).every((x) => x.acceptedQuantity !== null && x.dispatchedQuantity >= Number(x.acceptedQuantity) && x.receivedQuantity >= Number(x.acceptedQuantity));
  if (buyer <= 0.005 && seller <= 0.005 && isComplete) return "SETTLED";
  return settled > 0 ? "PARTIALLY_SETTLED" : "OPEN";
}

export function interVerticalCommerceRoutes(server: FastifyInstance): void {
  server.get("/api/v1/inter-vertical/health", async (_req, reply) => {
    try { await ensureSchema(); return reply.send({ success: true, data: { service: "inter-vertical-commerce-gateway", version: "1.0.0", persistence: "postgresql" } }); }
    catch (e) { return errorReply(reply, e); }
  });

  server.get("/api/v1/inter-vertical/connections", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req);
      const rows = await db.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE (buyer_tenant_id=$1 AND buyer_branch_id=$2) OR (seller_tenant_id=$1 AND (seller_branch_id=$2 OR seller_branch_id IS NULL)) ORDER BY created_at DESC", c.tenantId, c.branchId);
      const data = await Promise.all(rows.map(async (x: any) => {
        const buyer = await db.tenant.findUnique({ where: { id: x.buyer_tenant_id }, select: { id: true, name: true, slug: true } });
        const seller = await db.tenant.findUnique({ where: { id: x.seller_tenant_id }, select: { id: true, name: true, slug: true } });
        return { id: x.id, buyerTenantId: x.buyer_tenant_id, buyerBranchId: x.buyer_branch_id, sellerTenantId: x.seller_tenant_id, sellerBranchId: x.seller_branch_id, buyerName: buyer?.name || null, sellerName: seller?.name || null, status: x.status, buyerSupplierId: x.buyer_supplier_id, sellerCustomerId: x.seller_customer_id, notes: x.notes, createdAt: x.created_at, updatedAt: x.updated_at };
      }));
      return reply.send({ success: true, data });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/connections", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "purchase.create", "purchasing.create", "supplier.create", "suppliers.write");
      const b = LinkCreate.parse(req.body);
      if (b.sellerTenantId === c.tenantId) throw new Error("CANNOT_CONNECT_TENANT_TO_ITSELF");
      const dupe = await db.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE buyer_tenant_id=$1 AND buyer_branch_id=$2 AND idempotency_key=$3", c.tenantId, c.branchId, b.idempotencyKey);
      if (dupe.length) return reply.send({ success: true, data: dupe[0] });
      const seller = await db.tenant.findUnique({ where: { id: b.sellerTenantId }, select: { id: true, status: true } });
      if (!seller || seller.status !== "ACTIVE") throw new Error("SELLER_TENANT_NOT_FOUND_OR_INACTIVE");
      const pair = await db.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE buyer_tenant_id=$1 AND buyer_branch_id=$2 AND seller_tenant_id=$3 AND status IN ('PENDING','ACTIVE') ORDER BY created_at DESC LIMIT 1", c.tenantId, c.branchId, b.sellerTenantId);
      if (pair.length) { if (pair[0].status === "ACTIVE") return reply.send({ success: true, data: pair[0] }); throw new Error("CONNECTION_ALREADY_PENDING"); }
      const row = await db.$queryRawUnsafe("INSERT INTO inter_vertical_connections (id,buyer_tenant_id,buyer_branch_id,seller_tenant_id,status,requested_by_user_id,notes,idempotency_key) VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7) RETURNING *", randomUUID(), c.tenantId, c.branchId, b.sellerTenantId, c.userId, b.notes, b.idempotencyKey);
      return reply.status(201).send({ success: true, data: row[0] });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/connections/:id/respond", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "supplier.create", "suppliers.write", "purchase.approve", "purchasing.manage", "sales.manage");
      const id = String((req.params as any).id || ""), b = LinkResponse.parse(req.body);
      const row = await db.$transaction(async (tx: any) => {
        const replay = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE seller_tenant_id=$1 AND seller_branch_id=$2 AND seller_response_idempotency_key=$3", c.tenantId, c.branchId, b.idempotencyKey);
        if (replay.length) return replay[0];
        const rows = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE id=$1 AND seller_tenant_id=$2 FOR UPDATE", id, c.tenantId);
        const link = rows[0]; if (!link) throw new Error("CONNECTION_NOT_FOUND");
        if (link.status === "ACTIVE" && b.action === "ACCEPT" && link.seller_branch_id === c.branchId) return link;
        if (link.status !== "PENDING") throw new Error("CONNECTION_INVALID_STATUS:" + link.status);
        if (b.action === "ACCEPT" && (!b.creditLimit || b.creditLimit <= 0)) throw new Error("SELLER_CREDIT_LIMIT_REQUIRED");
        const buyer = await tx.tenant.findUnique({ where: { id: link.buyer_tenant_id }, select: { id: true, name: true, slug: true } });
        const seller = await tx.tenant.findUnique({ where: { id: link.seller_tenant_id }, select: { id: true, name: true, slug: true } });
        if (!buyer || !seller) throw new Error("CONNECTION_PARTY_NOT_FOUND");
        await tx.branch.findFirstOrThrow({ where: { id: c.branchId, tenantId: c.tenantId } });
        await tx.branch.findFirstOrThrow({ where: { id: link.buyer_branch_id, tenantId: link.buyer_tenant_id } });
        if (b.action === "REJECT") {
          const rejected = await tx.$queryRawUnsafe("UPDATE inter_vertical_connections SET status='REJECTED',seller_branch_id=$2,accepted_by_user_id=$3,notes=$4,seller_response_idempotency_key=$5,updated_at=now() WHERE id=$1 RETURNING *", id, c.branchId, c.userId, (link.notes ? link.notes + " | " : "") + "Rejected: " + (b.reason || "No reason supplied"), b.idempotencyKey);
          return rejected[0];
        }
        const suffix = id.replace(/-/g, "").slice(0,10).toUpperCase();
        const supCount = await tx.supplier.count({ where: { tenantId: link.buyer_tenant_id, branchId: link.buyer_branch_id } });
        const custCount = await tx.customer.count({ where: { tenantId: link.seller_tenant_id, branchId: c.branchId } });
        const supplier = await tx.supplier.create({ data: { id: randomUUID(), tenantId: link.buyer_tenant_id, branchId: link.buyer_branch_id, supplierCode: "B2B-" + suffix + "-" + (supCount + 1), name: seller.name, address: seller.slug, status: "ACTIVE" } });
        const customer = await tx.customer.create({ data: { id: randomUUID(), tenantId: link.seller_tenant_id, branchId: c.branchId, customerCode: "B2B-" + suffix + "-" + (custCount + 1), name: buyer.name, address: buyer.slug, creditLimit: b.creditLimit, currentBalance: 0, customerSegment: "B2B", status: "ACTIVE" } });
        const accepted = await tx.$queryRawUnsafe("UPDATE inter_vertical_connections SET status='ACTIVE',seller_branch_id=$2,buyer_supplier_id=$3,seller_customer_id=$4,accepted_by_user_id=$5,seller_response_idempotency_key=$6,updated_at=now() WHERE id=$1 RETURNING *", id, c.branchId, supplier.id, customer.id, c.userId, b.idempotencyKey);
        return accepted[0];
      });
      return reply.send({ success: true, data: row });
    } catch (e) { return errorReply(reply, e); }
  });

  server.get("/api/v1/inter-vertical/catalog", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req), id = String((req.query as any)?.connectionId || "");
      if (!id) throw new Error("CONNECTION_ID_REQUIRED");
      const links = await db.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE id=$1 AND buyer_tenant_id=$2 AND buyer_branch_id=$3 AND status='ACTIVE'", id, c.tenantId, c.branchId);
      if (!links.length) throw new Error("ACTIVE_CONNECTION_NOT_FOUND");
      const l = links[0];
      const variants = await db.productVariant.findMany({ where: { tenantId: l.seller_tenant_id, branchId: l.seller_branch_id, isActive: true }, include: { product: { select: { name: true, sku: true, description: true } } }, orderBy: { name: "asc" }, take: 500 });
      return reply.send({ success: true, data: variants.map((v: any) => ({ sellerVariantId: v.id, productId: v.productId, sku: v.sku, name: v.name || v.product?.name || v.sku, description: v.product?.description || "", proposedUnitPrice: Number(v.price || 0), available: Math.max(0, Number(v.inventoryQuantity || 0)) })) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "purchase.create", "purchasing.create", "purchase.manage");
      const b = OrderCreate.parse(req.body);
      const prior = await db.$queryRawUnsafe("SELECT * FROM inter_vertical_orders WHERE buyer_tenant_id=$1 AND buyer_branch_id=$2 AND idempotency_key=$3", c.tenantId, c.branchId, b.idempotencyKey);
      if (prior.length) return reply.send({ success: true, data: orderDto(prior[0]) });
      const connections = await db.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE id=$1 AND buyer_tenant_id=$2 AND buyer_branch_id=$3 AND status='ACTIVE'", b.connectionId, c.tenantId, c.branchId);
      const link = connections[0]; if (!link?.seller_branch_id || !link.buyer_supplier_id || !link.seller_customer_id) throw new Error("ACTIVE_CONNECTION_NOT_FOUND");
      if (new Set(b.items.map((x) => x.sellerVariantId)).size !== b.items.length) throw new Error("DUPLICATE_ORDER_LINE");
      const variants = await db.productVariant.findMany({ where: { id: { in: b.items.map((x) => x.sellerVariantId) }, tenantId: link.seller_tenant_id, branchId: link.seller_branch_id, isActive: true }, include: { product: { select: { name: true, sku: true } } } });
      if (variants.length !== b.items.length) throw new Error("SELLER_VARIANT_BOUNDARY_OR_NOT_FOUND");
      const localMatches = await db.productVariant.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, sku: { in: variants.map((v: any) => String(v.sku)) }, isActive: true }, select: { id: true, sku: true } });
      const localBySku = new Map<string, string>(localMatches.map((v: any): [string, string] => [String(v.sku), String(v.id)]));
      const byId = new Map(variants.map((v: any) => [String(v.id), v]));
      const items: Item[] = b.items.map((x) => {
        const v: any = byId.get(x.sellerVariantId);
        return { lineId: randomUUID(), sellerVariantId: v.id, buyerVariantId: x.buyerVariantId || localBySku.get(String(v.sku)) || null,
          sku: String(v.sku), name: String(v.name || v.product?.name || v.sku), requestedQuantity: x.quantity,
          proposedUnitPrice: Number(v.price || 0), acceptedQuantity: null, unitPrice: null, dispatchedQuantity: 0, receivedQuantity: 0 };
      });
      if (items.some((item) => !item.buyerVariantId)) throw new Error("BUYER_VARIANT_MAPPING_REQUIRED: map every wholesaler SKU to a Retail inventory variant before submitting the order");
      if (new Set(items.map((item) => item.buyerVariantId)).size !== items.length) throw new Error("DUPLICATE_BUYER_VARIANT_MAPPING");
      for (const item of items) {
        if (!item.buyerVariantId) throw new Error("BUYER_VARIANT_MAPPING_REQUIRED: map every wholesaler SKU to a Retail inventory variant before submitting the order");
        const local = await db.productVariant.findFirst({ where: { id: item.buyerVariantId, tenantId: c.tenantId, branchId: c.branchId, isActive: true }, select: { id: true } });
        if (!local) throw new Error("BUYER_VARIANT_BOUNDARY_OR_NOT_FOUND");
      }
      const id = randomUUID(), number = "IVO-" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + id.slice(0,8).toUpperCase();
      const nativePoNumber = "IVPO-" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + id.slice(0,8).toUpperCase();
      const inserted = await db.$transaction(async (tx: any) => {
        const proposedTotal = items.reduce((sum, item) => sum + item.requestedQuantity * item.proposedUnitPrice, 0);
        const nativePo = await tx.purchaseOrder.create({ data: {
          id: randomUUID(), tenantId: c.tenantId, branchId: c.branchId, orderNumber: nativePoNumber,
          supplierId: link.buyer_supplier_id, status: "DRAFT", totalAmount: proposedTotal,
          notes: "Inter-Vertical Gateway order " + number, createdById: c.userId,
          items: { create: items.map((item) => ({
            id: randomUUID(), variantId: item.buyerVariantId!, quantityOrdered: item.requestedQuantity,
            quantityReceived: 0, unitCost: item.proposedUnitPrice, totalCost: item.requestedQuantity * item.proposedUnitPrice,
          })) },
        } });
        const rows = await tx.$queryRawUnsafe("INSERT INTO inter_vertical_orders (id,order_number,connection_id,buyer_purchase_order_id,buyer_tenant_id,buyer_branch_id,seller_tenant_id,seller_branch_id,buyer_supplier_id,seller_customer_id,status,currency,items,notes,created_by_user_id,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED',$11,$12::jsonb,$13,$14,$15) RETURNING *",
          id, number, link.id, nativePo.id, c.tenantId, c.branchId, link.seller_tenant_id, link.seller_branch_id, link.buyer_supplier_id, link.seller_customer_id,
          b.currency.toUpperCase(), JSON.stringify(items), b.notes, c.userId, b.idempotencyKey);
        await event(tx, id, c, "ORDER_SUBMITTED", null, "SUBMITTED", b.idempotencyKey, { orderNumber: number, connectionId: link.id, purchaseOrderId: nativePo.id, lineCount: items.length });
        return rows[0];
      });
      return reply.status(201).send({ success: true, data: orderDto(inserted) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.get("/api/v1/inter-vertical/orders", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req), query = (req.query as any) || {};
      const role = String(query.role || "all").toLowerCase(), status = String(query.status || "").trim().toUpperCase();
      let sql = "SELECT * FROM inter_vertical_orders WHERE ((buyer_tenant_id=$1 AND buyer_branch_id=$2) OR (seller_tenant_id=$1 AND seller_branch_id=$2))";
      if (role === "buyer") sql = "SELECT * FROM inter_vertical_orders WHERE buyer_tenant_id=$1 AND buyer_branch_id=$2";
      if (role === "seller") sql = "SELECT * FROM inter_vertical_orders WHERE seller_tenant_id=$1 AND seller_branch_id=$2";
      const values: any[] = [c.tenantId, c.branchId];
      if (status) { values.push(status); sql += " AND status=$" + values.length; }
      sql += " ORDER BY created_at DESC LIMIT 200";
      const rows = await db.$queryRawUnsafe(sql, ...values);
      return reply.send({ success: true, data: rows.map(orderDto) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.get("/api/v1/inter-vertical/orders/:id", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req), id = String((req.params as any).id || "");
      const rows = await orderFor(db, id, c); if (!rows.length) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
      const [events, payments] = await Promise.all([
        db.$queryRawUnsafe("SELECT action,from_status,to_status,payload,created_at FROM inter_vertical_order_events WHERE order_id=$1 ORDER BY created_at", id),
        db.$queryRawUnsafe("SELECT id,amount,payment_method,provider,provider_reference,notes,status,submitted_by_user_id,created_at,confirmed_at FROM inter_vertical_payment_requests WHERE order_id=$1 ORDER BY created_at DESC", id),
      ]);
      return reply.send({ success: true, data: { ...orderDto(rows[0]), events: events.map((x: any) => ({ action: x.action, fromStatus: x.from_status, toStatus: x.to_status, payload: x.payload, createdAt: x.created_at })),
        payments: payments.map((x: any) => ({ id: x.id, amount: Number(x.amount), paymentMethod: x.payment_method, provider: x.provider, providerReference: x.provider_reference, notes: x.notes, status: x.status, submittedByUserId: x.submitted_by_user_id, createdAt: x.created_at, confirmedAt: x.confirmed_at })) } });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/respond", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "purchase.approve", "purchasing.manage", "sales.manage", "wholesale.orders.manage");
      const id = String((req.params as any).id || ""), b = OrderRespond.parse(req.body);
      const row = await db.$transaction(async (tx: any) => {
        const rows = await orderFor(tx, id, c, "SELLER", true), o = rows[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        if (await replayEvent(tx, c, b.idempotencyKey)) return o;
        if (o.status !== "SUBMITTED") throw new Error("ORDER_INVALID_STATUS:" + o.status);
        if (b.action === "REJECT") {
          const updated = await patchOrder(tx, id, { status: "REJECTED", rejection_reason: b.reason || "Seller declined the request" });
          if (o.buyer_purchase_order_id) {
            await tx.purchaseOrder.updateMany({ where: { id: o.buyer_purchase_order_id, tenantId: o.buyer_tenant_id, branchId: o.buyer_branch_id, status: "DRAFT" }, data: { status: "CANCELLED", notes: "Inter-Vertical order " + o.order_number + " rejected by seller: " + (b.reason || "Seller declined the request") } });
          }
          await event(tx, id, c, "ORDER_REJECTED", o.status, "REJECTED", b.idempotencyKey, { reason: b.reason }); return updated;
        }
        const items = itemsOf(o), overrides = new Map((b.items || []).map((x) => [x.lineId, x]));
        if ((b.items || []).length && new Set((b.items || []).map((x) => x.lineId)).size !== b.items!.length) throw new Error("DUPLICATE_ORDER_LINE");
        let total = 0;
        for (const item of items) {
          const v = await tx.productVariant.findFirst({ where: { id: item.sellerVariantId, tenantId: c.tenantId, branchId: c.branchId, isActive: true }, select: { id: true, productId: true, price: true } });
          if (!v) throw new Error("SELLER_VARIANT_BOUNDARY_OR_NOT_FOUND");
          const chosen: any = overrides.get(item.lineId);
          const quantity = chosen ? chosen.quantity : item.requestedQuantity;
          const pricing = await PricingAuthority.resolveUnitPrice(tx, c, {
            variantId: item.sellerVariantId, productId: v.productId, customerId: o.seller_customer_id,
            quantity, requestedUnitPrice: chosen?.unitPrice, priceOverrideReason: chosen?.priceOverrideReason,
          });
          const price = pricing.unitPrice;
          if (price <= 0 || !Number.isFinite(price)) throw new Error("SELLER_UNIT_PRICE_REQUIRED");
          if (await ledgerQty(tx, c.tenantId, c.branchId, item.sellerVariantId) < quantity) throw new Error("INSUFFICIENT_STOCK_FOR_ACCEPTED_QUANTITY");
          item.acceptedQuantity = quantity; item.unitPrice = price; total += price * quantity;
        }
        if ((b.items || []).some((x) => !items.some((i) => i.lineId === x.lineId))) throw new Error("ORDER_LINE_NOT_FOUND");
        const customer = await tx.customer.findFirst({ where: { id: o.seller_customer_id, tenantId: c.tenantId, branchId: c.branchId } });
        if (!customer) throw new Error("COUNTERPARTY_FINANCE_MAPPING_NOT_FOUND");
        if (Number(customer.currentBalance || 0) + total > Number(customer.creditLimit || 0) + 0.005) throw new Error("SELLER_CREDIT_LIMIT_EXCEEDED");
        const buyerPo = await tx.purchaseOrder.findFirst({ where: { id: o.buyer_purchase_order_id, tenantId: o.buyer_tenant_id, branchId: o.buyer_branch_id }, include: { items: true } });
        if (!buyerPo) throw new Error("NATIVE_PURCHASE_ORDER_NOT_FOUND");
        for (const item of items) {
          const poItem = buyerPo.items.find((x: any) => x.variantId === item.buyerVariantId);
          if (!poItem) throw new Error("NATIVE_PURCHASE_ORDER_LINE_NOT_FOUND");
          await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: {
            quantityOrdered: Number(item.acceptedQuantity), quantityReceived: 0,
            unitCost: Number(item.unitPrice), totalCost: Number(item.acceptedQuantity) * Number(item.unitPrice),
          } });
        }
        await tx.purchaseOrder.update({ where: { id: buyerPo.id }, data: {
          status: "APPROVED", totalAmount: total,
          notes: [buyerPo.notes, "Wholesale accepted Inter-Vertical order " + o.order_number].filter(Boolean).join(" | "),
        } });
        const updated = await patchOrder(tx, id, { status: "ACCEPTED", accepted_by_user_id: c.userId, items, total_amount: total });
        await event(tx, id, c, "ORDER_ACCEPTED", o.status, "ACCEPTED", b.idempotencyKey, { totalAmount: total, items: items.map((i) => ({ lineId: i.lineId, quantity: i.acceptedQuantity, unitPrice: i.unitPrice })) });
        return updated;
      });
      return reply.send({ success: true, data: orderDto(row) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/cancel", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "purchase.create", "purchasing.create", "purchase.manage");
      const b = z.object({ idempotencyKey: z.string().trim().min(8).max(200), reason: z.string().trim().max(1000).optional().default("") }).parse(req.body);
      const id = String((req.params as any).id || "");
      const row = await db.$transaction(async (tx: any) => {
        const rows = await orderFor(tx, id, c, "BUYER", true), o = rows[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        if (await replayEvent(tx, c, b.idempotencyKey)) return o;
        if (!["SUBMITTED","ACCEPTED"].includes(o.status) || itemsOf(o).some((x) => x.dispatchedQuantity > 0)) throw new Error("ORDER_CANNOT_BE_CANCELLED:" + o.status);
        const updated = await patchOrder(tx, id, { status: "CANCELLED", rejection_reason: b.reason || null });
        if (o.buyer_purchase_order_id) {
          await tx.purchaseOrder.updateMany({ where: { id: o.buyer_purchase_order_id, tenantId: o.buyer_tenant_id, branchId: o.buyer_branch_id, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "CANCELLED", notes: "Inter-Vertical order " + o.order_number + " cancelled by buyer: " + (b.reason || "Cancelled") } });
        }
        await event(tx, id, c, "ORDER_CANCELLED", o.status, "CANCELLED", b.idempotencyKey, { reason: b.reason }); return updated;
      });
      return reply.send({ success: true, data: orderDto(row) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/dispatch", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "sales.create", "sales.manage", "inventory.transfer", "wholesale.orders.manage");
      const id = String((req.params as any).id || ""), b = Dispatch.parse(req.body);
      const row = await db.$transaction(async (tx: any) => {
        const rows = await orderFor(tx, id, c, "SELLER", true), o = rows[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        if (await replayEvent(tx, c, b.idempotencyKey)) return o;
        if (!["ACCEPTED","PARTIALLY_DISPATCHED","PARTIALLY_RECEIVED","IN_TRANSIT"].includes(o.status)) throw new Error("ORDER_INVALID_STATUS_FOR_DISPATCH:" + o.status);
        if (!o.buyer_purchase_order_id) throw new Error("NATIVE_PURCHASE_ORDER_NOT_FOUND");
        await tx.$queryRawUnsafe(
          'SELECT id FROM purchase_orders WHERE id=$1 AND "tenantId"=$2 AND "branchId"=$3 FOR UPDATE',
          o.buyer_purchase_order_id, o.buyer_tenant_id, o.buyer_branch_id,
        );
        const buyerPo = await tx.purchaseOrder.findFirst({
          where: { id: o.buyer_purchase_order_id, tenantId: o.buyer_tenant_id, branchId: o.buyer_branch_id },
          include: { items: true },
        });
        if (!buyerPo || buyerPo.status === "CANCELLED" || buyerPo.status === "REJECTED") throw new Error("NATIVE_PURCHASE_ORDER_NOT_SHIPPABLE");
        const items = itemsOf(o), dispatch: Array<{ item: Item; quantity: number; variant: any }> = [];
        if (new Set(b.items.map((x) => x.lineId)).size !== b.items.length) throw new Error("DUPLICATE_ORDER_LINE");
        for (const x of b.items) {
          const item = items.find((i) => i.lineId === x.lineId); if (!item) throw new Error("ORDER_LINE_NOT_FOUND");
          if (!item.unitPrice || x.quantity > Number(item.acceptedQuantity || 0) - item.dispatchedQuantity) throw new Error("DISPATCH_QUANTITY_EXCEEDS_ACCEPTED");
          if (!item.buyerVariantId) throw new Error("BUYER_VARIANT_MAPPING_REQUIRED");
          const poItem = buyerPo.items.find((p: any) => p.variantId === item.buyerVariantId);
          if (!poItem || Number(poItem.quantityOrdered) < Number(item.dispatchedQuantity) + x.quantity - 0.0001) throw new Error("DISPATCH_EXCEEDS_NATIVE_PURCHASE_ORDER");
          const variant = await tx.productVariant.findFirst({ where: { id: item.sellerVariantId, tenantId: c.tenantId, branchId: c.branchId, isActive: true } });
          if (!variant) throw new Error("SELLER_VARIANT_BOUNDARY_OR_NOT_FOUND");
          await stockMove(tx, c, variant, -x.quantity, o.id, "dispatch-" + b.idempotencyKey + "-" + item.lineId, "SALE");
          item.dispatchedQuantity += x.quantity; dispatch.push({ item, quantity: x.quantity, variant });
        }
        const shipmentId = randomUUID();
        const documents = await sellerInvoice(tx, c, o, dispatch, b.idempotencyKey, shipmentId);
        const allocationByLine = new Map(documents.allocations.map((x) => [x.item.lineId, x]));
        for (const x of dispatch) {
          const built = allocationByLine.get(x.item.lineId);
          if (!built) throw new Error("DISPATCH_TAX_SNAPSHOT_MISSING");
          x.item.dispatchAllocations = [...(x.item.dispatchAllocations || []), built.allocation];
        }

        const eta = b.eta ? new Date(b.eta) : new Date(Date.now() + 7 * 86400000);
        await tx.$executeRawUnsafe(
          "INSERT INTO supply_chain_shipments (id,tenant_id,branch_id,po_id,supplier_id,gateway_order_id,source_tenant_id,source_branch_id,carrier_name,tracking_number,status,supplier_eta,carrier_eta,destination_warehouse_id,created_by_user_id,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CONFIRMED',$11,$12,NULL,$13,$14)",
          shipmentId, o.buyer_tenant_id, o.buyer_branch_id, o.buyer_purchase_order_id, o.buyer_supplier_id,
          o.id, o.seller_tenant_id, o.seller_branch_id, b.carrierName || "Unspecified carrier", b.trackingNumber || null,
          eta, b.eta ? new Date(b.eta) : null, c.userId, "ivg-shipment-" + o.id + "-" + b.idempotencyKey,
        );
        for (const x of dispatch) {
          const built = allocationByLine.get(x.item.lineId)!;
          const buyerVariant = await tx.productVariant.findFirst({
            where: { id: x.item.buyerVariantId, tenantId: o.buyer_tenant_id, branchId: o.buyer_branch_id, isActive: true },
            select: { productId: true },
          });
          if (!buyerVariant) throw new Error("BUYER_VARIANT_BOUNDARY_OR_NOT_FOUND");
          await tx.$executeRawUnsafe(
            "INSERT INTO supply_chain_shipment_lines (id,shipment_id,gateway_line_id,seller_variant_id,buyer_variant_id,product_id,sku,description,quantity_shipped,unit_price,net_amount,tax_rate_pct,tax_inclusive,tax_amount,gross_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
            randomUUID(), shipmentId, x.item.lineId, x.item.sellerVariantId, x.item.buyerVariantId,
            buyerVariant.productId, x.item.sku, x.item.name, x.quantity, x.item.unitPrice,
            built.allocation.netAmount, built.allocation.taxRatePct, built.allocation.taxInclusive,
            built.allocation.taxAmount, built.allocation.grossAmount,
          );
        }
        await tx.$executeRawUnsafe(
          "INSERT INTO supply_chain_shipment_events (id,shipment_id,tenant_id,branch_id,actor_user_id,action,from_status,to_status,idempotency_key,payload) VALUES ($1,$2,$3,$4,$5,'SHIPMENT_CONFIRMED',NULL,'CONFIRMED',$6,$7::jsonb)",
          randomUUID(), shipmentId, o.buyer_tenant_id, o.buyer_branch_id, c.userId,
          "gateway-shipment-confirmed:" + o.id + ":" + b.idempotencyKey,
          JSON.stringify({ gatewayOrderId: o.id, carrierName: b.carrierName, trackingNumber: b.trackingNumber }),
        );
        const complete = items.every((x) => x.dispatchedQuantity >= Number(x.acceptedQuantity || 0));
        const logistics = {
          ...(o.logistics || {}), carrierName: b.carrierName, trackingNumber: b.trackingNumber,
          eta: b.eta || null, lastDispatchAt: new Date().toISOString(),
          shipmentIds: [...new Set([...(Array.isArray(o.logistics?.shipmentIds) ? o.logistics.shipmentIds : []), shipmentId])],
        };
        const next = complete ? "DISPATCHED" : "PARTIALLY_DISPATCHED";
        const updated = await patchOrder(tx, id, { status: next, items, logistics });
        await event(tx, id, c, "ORDER_DISPATCHED", o.status, next, b.idempotencyKey, {
          saleId: documents.sale.id, invoiceId: documents.invoice.id, amount: documents.amount,
          taxAmount: documents.taxAmount, fiscalizationId: documents.fiscalizationId,
          fiscalizationState: documents.fiscalizationState, shipmentId,
          carrierName: b.carrierName, trackingNumber: b.trackingNumber, eta: b.eta || null,
          items: dispatch.map((x) => ({ lineId: x.item.lineId, quantity: x.quantity })),
        });
        return updated;
      });
      return reply.send({ success: true, data: orderDto(row) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/in-transit", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "sales.manage", "inventory.transfer", "wholesale.orders.manage");
      const b = Transit.parse(req.body), id = String((req.params as any).id || "");
      const row = await db.$transaction(async (tx: any) => {
        const rows = await orderFor(tx, id, c, "SELLER", true), o = rows[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        if (await replayEvent(tx, c, b.idempotencyKey)) return o;
        if (!["DISPATCHED","PARTIALLY_DISPATCHED"].includes(o.status)) throw new Error("ORDER_INVALID_STATUS_FOR_TRANSIT:" + o.status);
        const eta = b.eta ? new Date(b.eta) : null;
        const shipmentRows = await tx.$queryRawUnsafe(
          "UPDATE supply_chain_shipments SET status='IN_TRANSIT',carrier_name=COALESCE(NULLIF($4,''),carrier_name),tracking_number=COALESCE(NULLIF($5,''),tracking_number),carrier_eta=COALESCE($6,carrier_eta),updated_at=now() WHERE tenant_id=$1 AND branch_id=$2 AND gateway_order_id=$3 AND status='CONFIRMED' RETURNING id",
          o.buyer_tenant_id, o.buyer_branch_id, o.id, b.carrierName || "", b.trackingNumber || "", eta,
        );
        if (!shipmentRows.length) throw new Error("SHIPMENT_NOT_READY_FOR_TRANSIT");
        for (const shipment of shipmentRows) {
          await tx.$executeRawUnsafe(
            "INSERT INTO supply_chain_shipment_events (id,shipment_id,tenant_id,branch_id,actor_user_id,action,from_status,to_status,idempotency_key,payload) VALUES ($1,$2,$3,$4,$5,'SHIPMENT_IN_TRANSIT','CONFIRMED','IN_TRANSIT',$6,$7::jsonb)",
            randomUUID(), shipment.id, o.buyer_tenant_id, o.buyer_branch_id, c.userId,
            "gateway-shipment-transit:" + shipment.id + ":" + b.idempotencyKey,
            JSON.stringify({ carrierName: b.carrierName, trackingNumber: b.trackingNumber, carrierEta: b.eta || null }),
          );
        }
        const l = { ...(o.logistics || {}), inTransitAt: new Date().toISOString(),
          shipmentIdsInTransit: shipmentRows.map((x: any) => x.id) };
        for (const k of ["carrierName","trackingNumber","eta"] as const) if (b[k] !== undefined) (l as any)[k] = b[k];
        const updated = await patchOrder(tx, id, { status: "IN_TRANSIT", logistics: l });
        await event(tx, id, c, "ORDER_IN_TRANSIT", o.status, "IN_TRANSIT", b.idempotencyKey, l); return updated;
      });
      return reply.send({ success: true, data: orderDto(row) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/receive", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "purchase.receive", "purchases.receive", "inventory.adjust", "inventory.transfer");
      const b = Receive.parse(req.body), id = String((req.params as any).id || "");
      const row = await db.$transaction(async (tx: any) => {
        const rows = await orderFor(tx, id, c, "BUYER", true), o = rows[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        if (await replayEvent(tx, c, b.idempotencyKey)) return o;
        if (!["DISPATCHED","PARTIALLY_DISPATCHED","IN_TRANSIT","PARTIALLY_RECEIVED"].includes(o.status)) throw new Error("ORDER_INVALID_STATUS_FOR_RECEIPT:" + o.status);
        const items = itemsOf(o), receives: ReceivePortion[] = [];
        if (new Set(b.items.map((x) => x.lineId)).size !== b.items.length) throw new Error("DUPLICATE_ORDER_LINE");
        for (const x of b.items) {
          const item = items.find((i) => i.lineId === x.lineId); if (!item) throw new Error("ORDER_LINE_NOT_FOUND");
          if (x.quantity > item.dispatchedQuantity - item.receivedQuantity) throw new Error("RECEIVED_QUANTITY_EXCEEDS_DISPATCHED");
          if (x.buyerVariantId) item.buyerVariantId = x.buyerVariantId;
          if (!item.buyerVariantId) throw new Error("BUYER_VARIANT_MAPPING_REQUIRED: map the wholesaler SKU to a Retail inventory variant before receiving");
          const variant = await tx.productVariant.findFirst({ where: { id: item.buyerVariantId, tenantId: c.tenantId, branchId: c.branchId, isActive: true } });
          if (!variant) throw new Error("BUYER_VARIANT_BOUNDARY_OR_NOT_FOUND");
          let remaining = x.quantity;
          for (const a of item.dispatchAllocations || []) {
            if (remaining <= 0.000001) break;
            const outstanding = Number(a.quantity) - Number(a.receivedQuantity);
            if (outstanding <= 0.000001) continue;
            const quantity = Math.min(remaining, outstanding);
            const closesAllocation = quantity >= outstanding - 0.000001;
            const grossAmount = closesAllocation
              ? Number(a.grossAmount) - Number(a.receivedGrossAmount)
              : Math.round((Number(a.grossAmount) * quantity / Number(a.quantity)) * 100) / 100;
            const taxAmount = closesAllocation
              ? Number(a.taxAmount) - Number(a.receivedTaxAmount)
              : Math.round((Number(a.taxAmount) * quantity / Number(a.quantity)) * 100) / 100;
            const netAmount = Math.round((grossAmount - taxAmount) * 100) / 100;
            a.receivedQuantity = Number(a.receivedQuantity) + quantity;
            a.receivedGrossAmount = Math.round((Number(a.receivedGrossAmount) + grossAmount) * 100) / 100;
            a.receivedTaxAmount = Math.round((Number(a.receivedTaxAmount) + taxAmount) * 100) / 100;
            a.receivedNetAmount = Math.round((Number(a.receivedNetAmount) + netAmount) * 100) / 100;
            receives.push({
              item, quantity, variant, batchNumber: x.batchNumber, expiryDate: x.expiryDate,
              shipmentId: a.shipmentId, unitPrice: a.unitPrice, taxRatePct: a.taxRatePct,
              taxInclusive: a.taxInclusive, netAmount, taxAmount, grossAmount,
            });
            remaining -= quantity;
          }
          if (remaining > 0.000001) throw new Error("DISPATCH_TAX_SNAPSHOT_MISSING: shipment lines do not cover the received quantity");
          item.receivedQuantity += x.quantity;
        }
        const links = await tx.$queryRawUnsafe("SELECT buyer_supplier_id FROM inter_vertical_connections WHERE id=$1 AND buyer_tenant_id=$2 AND buyer_branch_id=$3 AND seller_tenant_id=$4 AND seller_branch_id=$5 AND status='ACTIVE'", o.connection_id, c.tenantId, c.branchId, o.seller_tenant_id, o.seller_branch_id);
        if (!links.length || !links[0].buyer_supplier_id) throw new Error("ACTIVE_CONNECTION_NOT_FOUND");
        if (!o.buyer_purchase_order_id) throw new Error("NATIVE_PURCHASE_ORDER_NOT_FOUND");
        const receipt = await buyerReceipt(tx, c, o, links[0].buyer_supplier_id, o.buyer_purchase_order_id, receives, b.idempotencyKey, b.notes);
        for (const x of receives) {
          const changed = await tx.purchaseOrderItem.updateMany({
            where: { purchaseOrderId: o.buyer_purchase_order_id, variantId: x.variant.id },
            data: { quantityReceived: { increment: x.quantity } },
          });
          if (changed.count !== 1) throw new Error("NATIVE_PURCHASE_ORDER_LINE_NOT_FOUND");
        }
        const nativePo = await tx.purchaseOrder.findFirst({
          where: { id: o.buyer_purchase_order_id, tenantId: c.tenantId, branchId: c.branchId },
          include: { items: true },
        });
        if (!nativePo) throw new Error("NATIVE_PURCHASE_ORDER_NOT_FOUND");
        const nativePoStatus = nativePo.items.every((x: any) => Number(x.quantityReceived) >= Number(x.quantityOrdered)) ? "RECEIVED" : "PARTIALLY_RECEIVED";
        await tx.purchaseOrder.update({ where: { id: nativePo.id }, data: { status: nativePoStatus } });
        const allIn = items.every((x) => x.receivedQuantity >= x.dispatchedQuantity);
        const allOut = items.every((x) => x.dispatchedQuantity >= Number(x.acceptedQuantity || 0));
        const next = allIn && allOut ? "RECEIVED" : "PARTIALLY_RECEIVED";
        const updated = await patchOrder(tx, id, { status: next, items, logistics: { ...(o.logistics || {}), lastReceiptAt: new Date().toISOString() } });
        await event(tx, id, c, "ORDER_RECEIVED", o.status, next, b.idempotencyKey, { receiptId: receipt.receipt.id, supplierInvoiceId: receipt.supplierInvoice.id, amount: receipt.amount, taxAmount: receipt.taxAmount, shipmentIds: [...new Set(receives.map((x) => x.shipmentId))], items: receives.map((x) => ({ lineId: x.item.lineId, quantity: x.quantity, buyerVariantId: x.variant.id, shipmentId: x.shipmentId, grossAmount: x.grossAmount, taxAmount: x.taxAmount })) });
        return patchOrder(tx, id, { finance_status: await financeStatus(tx, updated, Number(updated.settled_amount || 0)) });
      });
      return reply.send({ success: true, data: orderDto(row) });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/payments", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "payment.create", "ap.manage", "payment.reconcile", "purchase.manage");
      const b = PaymentRequest.parse(req.body), id = String((req.params as any).id || "");
      const result = await db.$transaction(async (tx: any) => {
        const rows = await orderFor(tx, id, c, "BUYER", true), o = rows[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        const prior = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_payment_requests WHERE tenant_id=$1 AND branch_id=$2 AND idempotency_key=$3", c.tenantId, c.branchId, b.idempotencyKey);
        if (prior.length) return prior[0];
        if (!["PARTIALLY_RECEIVED","RECEIVED"].includes(o.status)) throw new Error("PAYMENT_REQUIRES_RECEIVED_GOODS");
        if (b.amount > (await openFinance(tx, id, "BUYER")) + 0.005 || b.amount > (await openFinance(tx, id, "SELLER")) + 0.005) throw new Error("PAYMENT_EXCEEDS_ORDER_OPEN_BALANCE");
        const insertedRows = await tx.$queryRawUnsafe("INSERT INTO inter_vertical_payment_requests (id,order_id,tenant_id,branch_id,submitted_by_user_id,amount,payment_method,provider,provider_reference,notes,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
          randomUUID(), id, c.tenantId, c.branchId, c.userId, b.amount, b.paymentMethod, b.provider || null, b.providerReference || null, b.notes, b.idempotencyKey);
        await patchOrder(tx, id, { finance_status: "PAYMENT_PENDING" });
        await event(tx, id, c, "PAYMENT_SUBMITTED", o.status, o.status, b.idempotencyKey, { paymentRequestId: insertedRows[0].id, amount: b.amount });
        return insertedRows[0];
      });
      return reply.status(201).send({ success: true, data: { id: result.id, orderId: result.order_id, amount: Number(result.amount), paymentMethod: result.payment_method, provider: result.provider, providerReference: result.provider_reference, notes: result.notes, status: result.status, createdAt: result.created_at } });
    } catch (e) { return errorReply(reply, e); }
  });

  server.post("/api/v1/inter-vertical/orders/:id/payments/:paymentId/confirm", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req); permission(c, "payment.reconcile", "ap.manage", "sales.manage", "wholesale.orders.manage");
      const b = z.object({ idempotencyKey: z.string().trim().min(8).max(200) }).parse(req.body);
      const id = String((req.params as any).id || ""), paymentId = String((req.params as any).paymentId || "");
      const row = await db.$transaction(async (tx: any) => {
        const orders = await orderFor(tx, id, c, "SELLER", true), o = orders[0]; if (!o) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
        if (await replayEvent(tx, c, b.idempotencyKey)) return o;
        const pays = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_payment_requests WHERE id=$1 AND order_id=$2 AND status='PENDING_CONFIRMATION' FOR UPDATE", paymentId, id);
        const p = pays[0]; if (!p) throw new Error("PAYMENT_REQUEST_NOT_FOUND_OR_ALREADY_CONFIRMED");
        const amount = Number(p.amount);
        if (amount > (await openFinance(tx, id, "BUYER")) + 0.005 || amount > (await openFinance(tx, id, "SELLER")) + 0.005) throw new Error("PAYMENT_EXCEEDS_ORDER_OPEN_BALANCE");
        const links = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_connections WHERE id=$1 AND status='ACTIVE' AND buyer_tenant_id=$2 AND seller_tenant_id=$3 AND buyer_branch_id=$4 AND seller_branch_id=$5", o.connection_id, o.buyer_tenant_id, o.seller_tenant_id, o.buyer_branch_id, o.seller_branch_id);
        const link = links[0]; if (!link) throw new Error("ACTIVE_CONNECTION_NOT_FOUND");
        const bc = tenantCtx(c, o.buyer_tenant_id, o.buyer_branch_id, p.submitted_by_user_id), sc = tenantCtx(c, o.seller_tenant_id, o.seller_branch_id, c.userId);
        const supplier = await tx.supplier.findFirst({ where: { id: link.buyer_supplier_id, tenantId: bc.tenantId, branchId: bc.branchId } });
        const customer = await tx.customer.findFirst({ where: { id: link.seller_customer_id, tenantId: sc.tenantId, branchId: sc.branchId } });
        if (!supplier || !customer) throw new Error("COUNTERPARTY_FINANCE_MAPPING_NOT_FOUND");
        if (Number(supplier.outstandingBalance || 0) + 0.005 < amount) throw new Error("BUYER_AP_BALANCE_TOO_LOW");
        if (Number(customer.currentBalance || 0) + 0.005 < amount) throw new Error("SELLER_AR_BALANCE_TOO_LOW");
        const now = new Date(), code = "IVP-" + now.toISOString().replace(/[^0-9]/g, "").slice(0,14) + "-" + paymentId.slice(0,8).toUpperCase();
        const buyerPayment = await tx.payment.create({ data: {
          id: randomUUID(), tenantId: bc.tenantId, branchId: bc.branchId, paymentNumber: code, purchaseReceiptId: null,
          supplierId: supplier.id, amount, paymentMethod: p.payment_method, provider: p.provider || null,
          providerReference: p.provider_reference || null, status: "COMPLETED", paidAt: now,
        } });
        const sellerPayment = await tx.payment.create({ data: {
          id: randomUUID(), tenantId: sc.tenantId, branchId: sc.branchId, paymentNumber: code + "-R",
          customerId: customer.id, amount, paymentMethod: p.payment_method, provider: p.provider || null,
          providerReference: p.provider_reference || null, status: "COMPLETED", paidAt: now,
        } });
        await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { decrement: amount } } });
        await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: amount } } });
        let remain = amount;
        const buyerDocs = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_finance_documents WHERE order_id=$1 AND side='BUYER' AND amount>paid_amount ORDER BY created_at FOR UPDATE", id);
        for (const doc of buyerDocs) {
          if (remain <= 0.005) break;
          const allocation = Math.min(remain, Number(doc.amount) - Number(doc.paid_amount));
          if (doc.document_type === "SUPPLIER_INVOICE") {
            const invoice = await tx.supplierInvoice.findFirst({
              where: { id: doc.document_id, tenantId: bc.tenantId, branchId: bc.branchId },
            });
            if (!invoice || Number(invoice.balanceDue) + 0.005 < allocation) throw new Error("BUYER_SUPPLIER_INVOICE_BALANCE_MISMATCH");
            const balance = Math.max(0, Number(invoice.balanceDue) - allocation);
            await tx.supplierInvoice.update({ where: { id: invoice.id }, data: {
              amountPaid: { increment: allocation }, balanceDue: balance,
              status: balance <= 0.005 ? "PAID" : "PARTIALLY_PAID",
            } });
            await tx.paymentAllocation.create({ data: {
              id: randomUUID(), tenantId: bc.tenantId, branchId: bc.branchId,
              paymentId: buyerPayment.id, supplierInvoiceId: invoice.id,
              allocatedAmount: allocation, createdById: bc.userId,
            } });
          }
          await tx.$executeRawUnsafe("UPDATE inter_vertical_finance_documents SET paid_amount=paid_amount+$2 WHERE id=$1", doc.id, allocation);
          remain -= allocation;
        }
        remain = amount;
        const sellerDocs = await tx.$queryRawUnsafe("SELECT * FROM inter_vertical_finance_documents WHERE order_id=$1 AND side='SELLER' AND amount>paid_amount ORDER BY created_at FOR UPDATE", id);
        for (const doc of sellerDocs) {
          if (remain <= 0.005) break;
          const allocation = Math.min(remain, Number(doc.amount) - Number(doc.paid_amount));
          await tx.$executeRawUnsafe("UPDATE inter_vertical_finance_documents SET paid_amount=paid_amount+$2 WHERE id=$1", doc.id, allocation);
          if (doc.document_type === "CUSTOMER_INVOICE") {
            const invoice = await tx.customerInvoice.findFirst({ where: { id: doc.document_id, tenantId: sc.tenantId, branchId: sc.branchId } });
            if (!invoice || Number(invoice.balanceDue) + 0.005 < allocation) throw new Error("SELLER_INVOICE_BALANCE_MISMATCH");
            const balance = Math.max(0, Number(invoice.balanceDue) - allocation);
            await tx.customerInvoice.update({ where: { id: invoice.id }, data: { amountPaid: { increment: allocation }, balanceDue: balance, status: balance <= 0.005 ? "PAID" : "PARTIALLY_PAID" } });
            await tx.paymentAllocation.create({ data: {
              id: randomUUID(), tenantId: sc.tenantId, branchId: sc.branchId,
              paymentId: sellerPayment.id, customerInvoiceId: invoice.id,
              allocatedAmount: allocation, createdById: sc.userId,
            } });
          }
          remain -= allocation;
        }
        const buyerAccounts = await finance.accounts(tx, bc);
        const buyerJournal = FinancialBridge.mapSupplierPaymentToJournal(bc as any, buyerPayment as any, buyerAccounts as any,
          (await tx.journalEntry.count({ where: { tenantId: bc.tenantId, branchId: bc.branchId } })) + 1);
        await finance.writeJournal(tx, bc as any, buyerJournal);
        const sellerAccounts = await finance.accounts(tx, sc);
        const sellerJournal = FinancialBridge.mapCustomerPaymentToJournal(sc as any, sellerPayment as any, sellerAccounts as any,
          (await tx.journalEntry.count({ where: { tenantId: sc.tenantId, branchId: sc.branchId } })) + 1);
        await finance.writeJournal(tx, sc as any, sellerJournal);
        await tx.$executeRawUnsafe("UPDATE inter_vertical_payment_requests SET status='CONFIRMED',buyer_payment_id=$2,seller_payment_id=$3,confirmed_at=now() WHERE id=$1", paymentId, buyerPayment.id, sellerPayment.id);
        const settled = Number(o.settled_amount || 0) + amount;
        const interim = await patchOrder(tx, id, { settled_amount: settled });
        const fstatus = await financeStatus(tx, interim, settled);
        await event(tx, id, c, "PAYMENT_CONFIRMED", o.status, o.status, b.idempotencyKey, { paymentRequestId: paymentId, buyerPaymentId: buyerPayment.id, sellerPaymentId: sellerPayment.id, amount, financeStatus: fstatus });
        return patchOrder(tx, id, { finance_status: fstatus });
      });
      return reply.send({ success: true, data: { order: orderDto(row), paymentRequestId: paymentId, status: "CONFIRMED" } });
    } catch (e) { return errorReply(reply, e); }
  });

  server.get("/api/v1/inter-vertical/orders/:id/events", async (req, reply) => {
    try {
      await ensureSchema(); const c = ctxOf(req), id = String((req.params as any).id || "");
      if (!(await orderFor(db, id, c)).length) throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
      const rows = await db.$queryRawUnsafe("SELECT action,from_status,to_status,payload,created_at FROM inter_vertical_order_events WHERE order_id=$1 ORDER BY created_at", id);
      return reply.send({ success: true, data: rows.map((x: any) => ({ action: x.action, fromStatus: x.from_status, toStatus: x.to_status, payload: x.payload, createdAt: x.created_at })) });
    } catch (e) { return errorReply(reply, e); }
  });
}
