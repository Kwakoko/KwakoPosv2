import { randomUUID } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { PrismaAtomicCommercialFinanceService } from "./atomicCommercialFinance.js";
import { assertTenantIsolation, EmployeeEngine } from "@kwakopos2/domain";
import { projectProductBranchStock, projectProductStockSummary, projectVariantInventory } from "./inventoryAuthority.js";

const db: any = prisma;
const num = (v: unknown) => Number(v ?? 0);

function normalize(value: any): any {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    if (typeof value.toNumber === "function") return value.toNumber();
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function tenantWhere(ctx: TenantContext, branch = true) {
  return branch
    ? { tenantId: ctx.tenantId, branchId: ctx.branchId }
    : { tenantId: ctx.tenantId };
}

function assertRow(row: any, ctx: TenantContext, branch = true) {
  if (!row) return null;
  assertTenantIsolation(ctx, row.tenantId, branch ? row.branchId : undefined);
  return normalize(row);
}

async function findOne(model: string, id: string, ctx: TenantContext, branch = true) {
  const row = await db[model].findUnique({ where: { id } });
  return row && row.tenantId === ctx.tenantId && (!branch || row.branchId === ctx.branchId)
    ? normalize(row) : null;
}

function pick(input: any, keys: string[]) {
  const out: any = {};
  for (const key of keys) if (input[key] !== undefined) out[key] = input[key];
  return out;
}

function sanitizeEmployee(row: any): any {
  if (!row) return row;
  const { pinCodeHash: _pinCodeHash, ...safe } = row;
  return normalize(safe);
}

function employeeCanAccessBranch(ctx: TenantContext, branchId: string): boolean {
  if (branchId === ctx.branchId) return true;
  const roles = Array.isArray(ctx.roles) ? ctx.roles.map((r) => String(r).trim().toUpperCase()) : [];
  const permissions = new Set((Array.isArray(ctx.permissions) ? ctx.permissions : []).map((p) => String(p).trim().toLowerCase()));
  return roles.some((r) => ["OWNER", "ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(r)) || permissions.has("*") || permissions.has("branch.switch");
}

export class PrismaCommercialRepository {
  constructor(private readonly atomic = new PrismaAtomicCommercialFinanceService()) {}

  async getReportsData(ctx: TenantContext, options: { from: Date; to: Date; branchId?: string | null }) {
    const branchId = options.branchId || null;
    if (branchId) {
      const branch = await db.branch.findFirst({ where: { id: branchId, tenantId: ctx.tenantId } });
      if (!branch) throw new Error("REPORT_BRANCH_BOUNDARY_VIOLATION");
    }
    const scope = branchId ? { tenantId: ctx.tenantId, branchId } : { tenantId: ctx.tenantId };
    const saleScope = { ...scope, soldAt: { gte: options.from, lt: options.to } };
    const expenseScope = { ...scope, incurredAt: { gte: options.from, lt: options.to } };
    const paymentScope = { ...scope, paidAt: { gte: options.from, lt: options.to }, status: "COMPLETED", saleId: { not: null } };
    const returnScope = { ...scope, createdAt: { gte: options.from, lt: options.to } };
    const purchaseScope = { ...scope, createdAt: { gte: options.from, lt: options.to } };
    const movementScope = { ...scope, occurredAt: { gte: options.from, lt: options.to } };

    const [sales, expenses, payments, returns, purchaseOrders, stockMovements, customers, products, branches, invoices] =
      await Promise.all([
        db.sale.findMany({ where: saleScope, include: { lines: true, payments: true }, orderBy: { soldAt: "desc" } }),
        db.expense.findMany({ where: expenseScope, orderBy: { incurredAt: "desc" } }),
        db.payment.findMany({ where: paymentScope, orderBy: { paidAt: "desc" } }),
        db.return.findMany({ where: returnScope, include: { lines: true }, orderBy: { createdAt: "desc" } }),
        db.purchaseOrder.findMany({ where: purchaseScope, include: { items: true, supplier: true }, orderBy: { createdAt: "desc" } }),
        db.stockLedger.findMany({ where: movementScope, include: { product: true, variant: true }, orderBy: { occurredAt: "desc" } }),
        db.customer.findMany({ where: scope, orderBy: { createdAt: "asc" } }),
        db.product.findMany({ where: scope, include: { variants: true, branchStocks: true }, orderBy: { name: "asc" } }),
        branchId ? db.branch.findMany({ where: { tenantId: ctx.tenantId, id: branchId } }) : db.branch.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
        db.customerInvoice.findMany({ where: scope, include: { allocations: true }, orderBy: { dueDate: "asc" } }),
      ]);

    const activeSales = sales.filter((s: any) => !["CANCELLED", "VOIDED", "REFUNDED"].includes(String(s.status).toUpperCase()));
    const totalGrossSales = activeSales.reduce((n: number, s: any) => n + num(s.grandTotal), 0);
    const totalTaxCollected = activeSales.reduce((n: number, s: any) => n + num(s.taxTotal), 0);
    const totalDiscounts = activeSales.reduce((n: number, s: any) => n + num(s.discountTotal), 0);
    const totalCOGS = activeSales.reduce((n: number, s: any) => n + num(s.totalCost), 0);
    const totalExpenses = expenses.reduce((n: number, e: any) => n + num(e.amount), 0);
    const grossProfit = totalGrossSales - totalCOGS;
    const netOperatingProfit = grossProfit - totalExpenses;
    const paymentTotals: Record<string, { count: number; amount: number }> = {};
    for (const p of payments) {
      const key = String(p.provider || p.paymentMethod || "OTHER").toUpperCase();
      paymentTotals[key] ||= { count: 0, amount: 0 };
      paymentTotals[key].count += 1;
      paymentTotals[key].amount += num(p.amount);
    }

    return normalize({
      scope: { tenantId: ctx.tenantId, branchId, from: options.from, to: options.to },
      metrics: {
        totalGrossSales, totalTaxCollected, totalDiscounts, totalCOGS, totalExpenses,
        grossProfit, netOperatingProfit,
        marginPct: totalGrossSales ? (netOperatingProfit / totalGrossSales) * 100 : 0,
        totalTransactions: activeSales.length,
        paymentTotals,
      },
      sales: activeSales,
      returnedSales: returns,
      expenses,
      purchaseOrders,
      payments,
      stockMovements,
      customers,
      products,
      branches,
      invoices,
    });
  }

  async getCustomers(ctx: TenantContext) {
    return normalize(await db.customer.findMany({ where: tenantWhere(ctx), include: { contacts: true }, orderBy: { createdAt: "asc" } }));
  }

  async getCustomerById(ctx: TenantContext, id: string) {
    return normalize(await db.customer.findFirst({ where: { id, ...tenantWhere(ctx) }, include: { contacts: true } }));
  }

  async createCustomer(ctx: TenantContext, req: any) {
    const id = req.id || undefined;
    return normalize(await db.$transaction(async (tx: any) => {
      if (id) {
        const existing = await tx.customer.findFirst({ where: { id, ...tenantWhere(ctx) }, include: { contacts: true } });
        if (existing) return existing;
      }
      const count = await tx.customer.count({ where: tenantWhere(ctx) });
      const row = await tx.customer.create({ data: {
        id, tenantId: ctx.tenantId, branchId: ctx.branchId,
        customerCode: req.customerCode || `CUST-${String(count + 1).padStart(4, "0")}`,
        name: req.name, phone: req.phone ?? null, email: req.email ?? null,
        address: req.address ?? null, creditLimit: req.creditLimit ?? 0,
        currentBalance: req.openingBalance ?? 0, openingBalance: req.openingBalance ?? 0,
        walletBalance: 0, status: "ACTIVE",
      }});
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-service", action: "CUSTOMER_CREATED", entityType: "Customer", entityId: row.id,
        metadata: { customerCode: row.customerCode },
      }});
      return row;
    }));
  }

  async updateCustomer(ctx: TenantContext, id: string, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.customer.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!existing) throw new Error(`Customer ${id} not found`);
      const data = pick(req, ["name","phone","email","address","creditLimit","status"]);
      const updated = await tx.customer.update({ where: { id }, data });
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-service", action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: id,
        metadata: { changedFields: Object.keys(data).sort(), before: { name: existing.name, phone: existing.phone, email: existing.email, creditLimit: Number(existing.creditLimit), status: existing.status }, after: { name: updated.name, phone: updated.phone, email: updated.email, creditLimit: Number(updated.creditLimit), status: updated.status } },
      }});
      return updated;
    }));
  }

  async deleteCustomer(ctx: TenantContext, id: string) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.customer.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!existing) throw new Error(`Customer ${id} not found`);
      if (Number(existing.currentBalance) !== 0) throw new Error("CUSTOMER_HAS_OUTSTANDING_BALANCE");
      if (Number(existing.walletBalance) !== 0) throw new Error("CUSTOMER_HAS_WALLET_BALANCE");
      const updated = await tx.customer.update({ where: { id }, data: { status: "SUSPENDED" } });
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-service", action: "CUSTOMER_ARCHIVED", entityType: "Customer", entityId: id,
        metadata: { previousStatus: existing.status },
      }});
      return updated;
    }));
  }

  async getCustomerTransactions(ctx: TenantContext, id: string) {
    const customer = await db.customer.findFirst({ where: { id, ...tenantWhere(ctx) }, select: { id: true, name: true, currentBalance: true, creditLimit: true, walletBalance: true } });
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const [sales, payments, returns] = await Promise.all([
      db.sale.findMany({ where: { customerId: id, ...tenantWhere(ctx) }, orderBy: { soldAt: "desc" }, take: 200, select: { id: true, saleNumber: true, soldAt: true, grandTotal: true, status: true } }),
      db.payment.findMany({ where: { customerId: id, ...tenantWhere(ctx) }, orderBy: { paidAt: "desc" }, take: 200, select: { id: true, paymentNumber: true, amount: true, paymentMethod: true, provider: true, providerReference: true, status: true, paidAt: true } }),
      db.return.findMany({ where: { customerId: id, ...tenantWhere(ctx) }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, returnNumber: true, totalRefundAmount: true, refundType: true, status: true, createdAt: true } }),
    ]);
    return normalize({ customer, sales, payments, returns });
  }

  async recordCustomerPayment(ctx: TenantContext, id: string, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const customer = await tx.customer.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const amount = Number(req.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_PAYMENT_AMOUNT");
      if (amount > Number(customer.currentBalance)) throw new Error("PAYMENT_EXCEEDS_CUSTOMER_BALANCE");
      const paymentId = req.id || randomUUID();
      const paymentNumber = `PAY-CUST-${paymentId.slice(0, 24)}`;
      const existing = await tx.payment.findFirst({ where: { id: paymentId, ...tenantWhere(ctx) } });
      if (existing) return existing;
      const updateWhere: any = { id, tenantId: ctx.tenantId, branchId: ctx.branchId, currentBalance: { gte: amount } };
      if (req.payUsingWallet) updateWhere.walletBalance = { gte: amount };
      const balanceUpdate = await tx.customer.updateMany({
        where: updateWhere,
        data: req.payUsingWallet
          ? { currentBalance: { decrement: amount }, walletBalance: { decrement: amount } }
          : { currentBalance: { decrement: amount } },
      });
      if (balanceUpdate.count !== 1) {
        throw new Error(req.payUsingWallet ? "INSUFFICIENT_CUSTOMER_BALANCE_OR_WALLET" : "PAYMENT_EXCEEDS_CUSTOMER_BALANCE");
      }
      const payment = await tx.payment.create({ data: {
        id: paymentId, tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber,
        customerId: id, amount, paymentMethod: req.payUsingWallet ? "WALLET" : (req.paymentMethod || "CASH"),
        provider: req.provider || null, providerReference: req.providerReference || null,
        status: "COMPLETED", paidAt: new Date(),
      }});
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-service", action: "CUSTOMER_PAYMENT_RECORDED", entityType: "Payment", entityId: payment.id,
        metadata: { customerId: id, amount, payUsingWallet: Boolean(req.payUsingWallet) },
      }});
      return payment;
    }));
  }

  async depositCustomerWallet(ctx: TenantContext, id: string, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const customer = await tx.customer.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const amount = Number(req.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_WALLET_DEPOSIT");
      const paymentId = req.id || randomUUID();
      const paymentNumber = `WALLET-${paymentId.slice(0, 24)}`;
      const existing = await tx.payment.findFirst({ where: { id: paymentId, ...tenantWhere(ctx) } });
      if (existing) return existing;
      const payment = await tx.payment.create({ data: {
        id: paymentId, tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber,
        customerId: id, amount, paymentMethod: req.paymentMethod || "CASH",
        provider: req.provider || null, providerReference: req.providerReference || null,
        status: "COMPLETED", paidAt: new Date(),
      }});
      await tx.customer.update({ where: { id }, data: { walletBalance: { increment: amount } } });
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-service", action: "CUSTOMER_WALLET_DEPOSIT", entityType: "Payment", entityId: payment.id,
        metadata: { customerId: id, amount },
      }});
      return payment;
    }));
  }

  async getCustomerContacts(ctx: TenantContext, customerId?: string) {
    const where = customerId ? { ...tenantWhere(ctx), customerId } : tenantWhere(ctx);
    return normalize(await db.customerContact.findMany({ where, orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] }));
  }

  async getCustomerContactById(ctx: TenantContext, id: string) {
    return normalize(await db.customerContact.findFirst({ where: { id, ...tenantWhere(ctx) } }));
  }

  async createCustomerContact(ctx: TenantContext, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const customer = await tx.customer.findFirst({ where: { id: req.customerId, ...tenantWhere(ctx) } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const id = req.id || randomUUID();
      const existing = await tx.customerContact.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (existing) return existing;
      const count = await tx.customerContact.count({ where: tenantWhere(ctx) });
      if (req.isPrimary) await tx.customerContact.updateMany({ where: { ...tenantWhere(ctx), customerId: req.customerId, isPrimary: true }, data: { isPrimary: false } });
      const row = await tx.customerContact.create({ data: {
        id, tenantId: ctx.tenantId, branchId: ctx.branchId, customerId: req.customerId,
        contactCode: req.contactCode || `CNT-${String(count + 1).padStart(4, "0")}`,
        firstName: req.firstName, lastName: req.lastName || "", roleTitle: req.roleTitle || null,
        phone: req.phone || null, email: req.email || null, isPrimary: Boolean(req.isPrimary), notes: req.notes || null, status: "ACTIVE",
      }});
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-contact-service", action: "CUSTOMER_CONTACT_CREATED", entityType: "CustomerContact", entityId: row.id,
        metadata: { customerId: row.customerId, contactCode: row.contactCode },
      }});
      return row;
    }));
  }

  async updateCustomerContact(ctx: TenantContext, id: string, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.customerContact.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!existing) throw new Error("CONTACT_NOT_FOUND");
      const data = pick(req, ["firstName","lastName","roleTitle","phone","email","isPrimary","notes","status"]);
      if (req.isPrimary) await tx.customerContact.updateMany({ where: { ...tenantWhere(ctx), customerId: existing.customerId, isPrimary: true, id: { not: id } }, data: { isPrimary: false } });
      const updated = await tx.customerContact.update({ where: { id }, data });
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "customer-contact-service", action: "CUSTOMER_CONTACT_UPDATED", entityType: "CustomerContact", entityId: id,
        metadata: { changedFields: Object.keys(data).sort() },
      }});
      return updated;
    }));
  }

  async deleteCustomerContact(ctx: TenantContext, id: string) {
    return this.updateCustomerContact(ctx, id, { status: "SUSPENDED" });
  }

  async getCustomerContactHistory(ctx: TenantContext, id: string) {
    const contact = await db.customerContact.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!contact) throw new Error("CONTACT_NOT_FOUND");
    return normalize(await db.auditEvent.findMany({ where: { ...tenantWhere(ctx), entityType: "CustomerContact", entityId: id }, orderBy: { createdAt: "desc" }, take: 200 }));
  }

  async importCustomers(ctx: TenantContext, rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("IMPORT_ROWS_REQUIRED");
    if (rows.length > 2000) throw new Error("IMPORT_LIMIT_EXCEEDED");
    return normalize(await db.$transaction(async (tx: any) => {
      const results: any[] = [];
      for (const raw of rows) {
        const name = String(raw.name || "").trim();
        const phone = String(raw.phone || "").trim();
        if (!name || !phone) throw new Error("IMPORT_CUSTOMER_NAME_PHONE_REQUIRED");
        const count = await tx.customer.count({ where: tenantWhere(ctx) });
        const existing = await tx.customer.findFirst({ where: { ...tenantWhere(ctx), OR: [{ phone }, ...(raw.email ? [{ email: String(raw.email).trim() }] : [])] } });
        if (existing) { results.push({ ...normalize(existing), imported: false, duplicate: true }); continue; }
        const row = await tx.customer.create({ data: {
          id: raw.id || randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId,
          customerCode: raw.customerCode || `CUST-${String(count + 1).padStart(4, "0")}`,
          name, phone, email: raw.email ? String(raw.email).trim() : null, address: raw.address ? String(raw.address).trim() : null,
          creditLimit: Number(raw.creditLimit || 0), currentBalance: Number(raw.openingBalance || 0), openingBalance: Number(raw.openingBalance || 0), walletBalance: 0, status: "ACTIVE",
        }});
        await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "customer-import", action: "CUSTOMER_IMPORTED", entityType: "Customer", entityId: row.id, metadata: { source: "CSV", duplicate: false } } });
        results.push({ ...normalize(row), imported: true, duplicate: false });
      }
      return results;
    }));
  }

  async getSupplierTransactions(ctx: TenantContext, id: string) {
    const supplier = await db.supplier.findFirst({ where: { id, ...tenantWhere(ctx) }, select: { id: true, name: true, outstandingBalance: true } });
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    const [orders, receipts, payments] = await Promise.all([
      db.purchaseOrder.findMany({ where: { supplierId: id, ...tenantWhere(ctx) }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true } }),
      db.purchaseReceipt.findMany({ where: { supplierId: id, ...tenantWhere(ctx) }, orderBy: { receivedAt: "desc" }, take: 200, select: { id: true, receiptNumber: true, status: true, receivedAt: true, totalAmount: true } }),
      db.payment.findMany({ where: { supplierId: id, ...tenantWhere(ctx) }, orderBy: { paidAt: "desc" }, take: 200, select: { id: true, paymentNumber: true, amount: true, paymentMethod: true, status: true, paidAt: true } }),
    ]);
    return normalize({ supplier, orders, receipts, payments });
  }

  async getSuppliers(ctx: TenantContext) {
    return normalize(await db.supplier.findMany({ where: tenantWhere(ctx), orderBy: { createdAt: "asc" } }));
  }

  async getSupplierById(ctx: TenantContext, id: string) { return findOne("supplier", id, ctx); }

  async createSupplier(ctx: TenantContext, req: any) {
    const id = req.id || undefined;
    return normalize(await db.$transaction(async (tx: any) => {
      if (id) {
        const existing = await tx.supplier.findFirst({ where: { id, ...tenantWhere(ctx) } });
        if (existing) return existing;
      }
      const count = await tx.supplier.count({ where: tenantWhere(ctx) });
      const row = await tx.supplier.create({ data: {
        id, tenantId: ctx.tenantId, branchId: ctx.branchId,
        supplierCode: req.supplierCode || `SUP-${String(count + 1).padStart(4, "0")}`,
        name: req.name, phone: req.phone ?? null, email: req.email ?? null,
        address: req.address ?? null, taxPin: req.taxPin ?? null,
        outstandingBalance: req.outstandingBalance ?? 0, status: "ACTIVE",
      }});
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "supplier-service", action: "SUPPLIER_CREATED", entityType: "Supplier", entityId: row.id, metadata: { supplierCode: row.supplierCode } } });
      return row;
    }));
  }

  async updateSupplier(ctx: TenantContext, id: string, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.supplier.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!existing) throw new Error(`Supplier ${id} not found`);
      const data = pick(req, ["name","phone","email","address","taxPin","status"]);
      const updated = await tx.supplier.update({ where: { id }, data });
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "supplier-service", action: "SUPPLIER_UPDATED", entityType: "Supplier", entityId: id, metadata: { changedFields: Object.keys(data).sort() } } });
      return updated;
    }));
  }

  async getPurchaseOrders(ctx: TenantContext) {
    return normalize(await db.purchaseOrder.findMany({ where: tenantWhere(ctx), include: { items: true }, orderBy: { createdAt: "desc" } }));
  }

  async approvePurchaseOrder(ctx: TenantContext, id: string) {
    const po = await db.purchaseOrder.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!po) throw new Error("PURCHASE_ORDER_NOT_FOUND");
    if (po.status !== "DRAFT") throw new Error(`PURCHASE_ORDER_INVALID_STATUS:${po.status}`);
    return normalize(await db.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approvedById: ctx.userId || null } }));
  }

  async sendPurchaseOrder(ctx: TenantContext, id: string) {
    const po = await db.purchaseOrder.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!po) throw new Error("PURCHASE_ORDER_NOT_FOUND");
    if (po.status !== "APPROVED") throw new Error(`PURCHASE_ORDER_INVALID_STATUS:${po.status}`);
    return normalize(await db.purchaseOrder.update({ where: { id }, data: { status: "SENT" } }));
  }

  async getSupplierScorecard(ctx: TenantContext, supplierId: string) {
    const supplier = await db.supplier.findFirst({ where: { id: supplierId, ...tenantWhere(ctx) } });
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    const pos = await db.purchaseOrder.findMany({ where: { supplierId, ...tenantWhere(ctx) }, include: { items: true, purchaseReceipts: { include: { items: true } } } });
    let ordered = 0, received = 0, priceVariance = 0, priceSamples = 0;
    for (const po of pos) for (const item of po.items) {
      ordered += Number(item.quantityOrdered); received += Number(item.quantityReceived);
      const matching = po.purchaseReceipts.flatMap((r: any) => r.items).filter((i: any) => i.variantId === item.variantId);
      for (const r of matching) { priceVariance += Number(item.unitCost) ? ((Number(r.unitCost) - Number(item.unitCost)) / Number(item.unitCost)) * 100 : 0; priceSamples++; }
    }
    const fillRate = ordered ? Math.min(100, received / ordered * 100) : 100;
    const variance = priceSamples ? priceVariance / priceSamples : 0;
    const health = Math.max(0, Math.min(100, (fillRate * 0.6) + (Math.max(0, 100 - Math.abs(variance)) * 0.4)));
    return { supplierId, calculatedAt: new Date().toISOString(), onTimeDeliveryRatePct: 100, fillRatePct: Number(fillRate.toFixed(2)), qualityRatePct: 100, priceVariancePct: Number(variance.toFixed(2)), returnRatePct: 0, leadTimeAccuracyPct: 100, disputeCount: 0, healthScore: Number(health.toFixed(2)), ratingCategory: health >= 90 ? "EXCELLENT" : health >= 75 ? "GOOD" : health >= 60 ? "ADEQUATE" : health >= 40 ? "POOR" : "CRITICAL" };
  }

  async createPurchaseOrder(ctx: TenantContext, req: any) {
    if (req.id) {
      const existing = await db.purchaseOrder.findFirst({ where: { id: req.id, ...tenantWhere(ctx) }, include: { items: true } });
      if (existing) return normalize(existing);
    }
    await this.requireEntity("supplier", ctx, req.supplierId);
    const count = await db.purchaseOrder.count({ where: tenantWhere(ctx) });
    const orderNumber = req.orderNumber || `PUR-MAIN-${String(count + 1).padStart(6, "0")}`;
    const items = (req.items || []).map((item: any) => ({
      id: item.id || randomUUID(), variantId: item.variantId,
      quantityOrdered: item.quantityOrdered, quantityReceived: item.quantityReceived || 0,
      unitCost: item.unitCost, totalCost: item.totalCost ?? item.quantityOrdered * item.unitCost,
    }));
    const totalAmount = items.reduce((sum: number, item: any) => sum + Number(item.totalCost || 0), 0);
    return normalize(await db.purchaseOrder.create({ data: {
      id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId,
      orderNumber, supplierId: req.supplierId, status: req.status || "DRAFT",
      totalAmount, notes: req.notes ?? null, createdById: ctx.userId,
      approvedById: req.status === "APPROVED" ? (ctx.userId || null) : null,
      orderedAt: req.orderedAt ? new Date(req.orderedAt) : undefined, items: { create: items },
    }, include: { items: true } }));
  }

  async createPurchaseReceipt(ctx: TenantContext, req: any) {
    return normalize(await this.atomic.createPurchaseReceipt(ctx, req));
  }

  async getPurchaseReceipts(ctx: TenantContext) {
    return normalize(await db.purchaseReceipt.findMany({ where: tenantWhere(ctx), include: { items: true }, orderBy: { receivedAt: "desc" } }));
  }

  async settleSupplierPayable(ctx: TenantContext, req: { supplierId: string; amount: number; paymentMethod: string; provider?: string; providerReference?: string; purchaseReceiptId?: string; idempotencyKey: string }) {
    const supplier = await db.supplier.findFirst({ where: { id: req.supplierId, ...tenantWhere(ctx) } });
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    if (req.amount <= 0) throw new Error("INVALID_PAYMENT_AMOUNT");
    if (req.amount > Number(supplier.outstandingBalance)) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING_PAYABLE");
    const paymentNumber = `PAY-SUP-${String(req.idempotencyKey).replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.payment.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber } });
      if (existing) return existing;
      const payment = await tx.payment.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber,
        purchaseReceiptId: req.purchaseReceiptId || null, supplierId: req.supplierId, amount: req.amount,
        paymentMethod: req.paymentMethod, provider: req.provider || null, providerReference: req.providerReference || null,
        status: "COMPLETED", paidAt: new Date(),
      } });
      await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { decrement: req.amount } } });
      return payment;
    }));
  }

  async performThreeWayMatch(ctx: TenantContext, req: { poId: string; receivingId: string; invoiceRef: string; invoiceAmount: number; approvedBy?: string }) {
    const po = await db.purchaseOrder.findFirst({ where: { id: req.poId, ...tenantWhere(ctx) }, include: { items: true } });
    const receipt = await db.purchaseReceipt.findFirst({ where: { id: req.receivingId, ...tenantWhere(ctx) }, include: { items: true } });
    const invoice = await db.supplierInvoice.findFirst({ where: { invoiceNumber: req.invoiceRef, ...tenantWhere(ctx) }, include: { lines: true } });
    if (!po) throw new Error("PURCHASE_ORDER_NOT_FOUND");
    if (!receipt) throw new Error("PURCHASE_RECEIPT_NOT_FOUND");
    if (!invoice) throw new Error("SUPPLIER_INVOICE_NOT_FOUND");
    if (po.supplierId !== receipt.supplierId || receipt.supplierId !== invoice.supplierId) throw new Error("THREE_WAY_SUPPLIER_MISMATCH");
    const receivedAmount = receipt.items.reduce((s: number, i: any) => s + Number(i.quantityReceived) * Number(i.unitCost), 0);
    const poAmount = Number(po.totalAmount);
    const priceVariance = Number(req.invoiceAmount) - receivedAmount;
    const quantityVariance = po.items.reduce((s: number, i: any) => s + Number(i.quantityOrdered) - Number(i.quantityReceived), 0);
    let status = "PERFECT_MATCH";
    if (Math.abs(priceVariance) > 0.01 && Math.abs(priceVariance) < Math.max(poAmount * 0.02, 0.01)) status = "VARIANCE_TOLERATED";
    else if (Math.abs(priceVariance) >= Math.max(poAmount * 0.02, 0.01)) status = "PRICE_MISMATCH";
    if (quantityVariance > 0) status = "QUANTITY_MISMATCH";
    const match = { matchId: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, poId: po.id, receivingId: receipt.id, invoiceId: invoice.id, invoiceRef: req.invoiceRef, poAmount, receivedAmount, invoiceAmount: Number(req.invoiceAmount), priceVariance, quantityVariance, status, matchedAt: new Date().toISOString(), approvedBy: req.approvedBy || ctx.userId };
    await db.supplierInvoice.update({ where: { id: invoice.id }, data: { status: status === "PERFECT_MATCH" || status === "VARIANCE_TOLERATED" ? "APPROVED" : "REJECTED", notes: JSON.stringify({ previousNotes: invoice.notes, threeWayMatch: match }) } });
    return match;
  }

  async getSales(ctx: TenantContext) {
    const sales = await db.sale.findMany({
      where: tenantWhere(ctx),
      include: { customer: true, lines: { include: { product: true, variant: true } }, payments: true },
      orderBy: { soldAt: "desc" },
      take: 100,
    });
    const cashierIds = Array.from(new Set(sales.map((sale: any) => sale.soldById).filter(Boolean)));
    const cashiers = cashierIds.length > 0
      ? await db.user.findMany({ where: { ...tenantWhere(ctx), id: { in: cashierIds } }, select: { id: true, name: true } })
      : [];
    const cashierNames = new Map(cashiers.map((user: any) => [user.id, user.name]));
    return normalize(sales.map((sale: any) => ({
      ...sale,
      cashierName: sale.soldById ? (cashierNames.get(sale.soldById) || null) : null,
    })));
  }

  async getSaleById(ctx: TenantContext, id: string) {
    const row = await db.sale.findFirst({ where: { id, ...tenantWhere(ctx) }, include: { lines: true, payments: true } });
    if (!row) return null;
    return normalize(row);
  }

  async createPosSale(ctx: TenantContext, req: any) {
    return normalize(await this.atomic.createSale(ctx, req));
  }

  async claimDrawerOperation(ctx: TenantContext, id: string) {
    return normalize(await db.$transaction(async (tx: any) => {
      const row = await tx.drawerOperation.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!row) throw new Error("DRAWER_OPERATION_NOT_FOUND");
      if (row.status === "UNKNOWN") throw new Error("DRAWER_OPERATION_UNKNOWN_REQUIRES_RECONCILIATION");
      if (!["PENDING", "FAILED", "TIMEOUT"].includes(row.status)) return row;
      const updated = await tx.drawerOperation.update({ where: { id }, data: { status: "EXECUTING", attempts: { increment: 1 }, startedAt: new Date(), completedAt: null, lastError: null } });
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: updated.deviceId, action: "CASH_DRAWER_EXECUTING", entityType: "DrawerOperation", entityId: updated.id, metadata: { operationType: updated.operationType, attempt: updated.attempts } } });
      return updated;
    }));
  }

  async completeDrawerOperation(ctx: TenantContext, id: string, status: string, error?: string) {
    const allowed = ["SUCCEEDED", "FAILED", "TIMEOUT", "UNKNOWN"];
    if (!allowed.includes(status)) throw new Error("INVALID_DRAWER_OPERATION_STATUS");
    return normalize(await db.$transaction(async (tx: any) => {
      const row = await tx.drawerOperation.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!row) throw new Error("DRAWER_OPERATION_NOT_FOUND");
      if (row.status !== "EXECUTING" && status !== "UNKNOWN") throw new Error("DRAWER_OPERATION_NOT_EXECUTING");
      const updated = await tx.drawerOperation.update({ where: { id }, data: { status, completedAt: new Date(), lastError: error ?? null } });
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: updated.deviceId, action: "CASH_DRAWER_" + status, entityType: "DrawerOperation", entityId: updated.id, metadata: { operationType: updated.operationType, attempts: updated.attempts, error: error ?? null } } });
      return updated;
    }));
  }

  async createNoSaleDrawerOperation(ctx: TenantContext, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const session = await tx.cashSession.findFirst({ where: { id: req.cashSessionId, ...tenantWhere(ctx), status: { not: "CLOSED" } } });
      if (!session || session.cashierId !== ctx.userId) throw new Error("CASH_DRAWER_SESSION_AUTHORIZATION_REQUIRED");
      const operation = await tx.drawerOperation.create({ data: { id: req.id || "drawer:" + randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, cashSessionId: session.id, operationType: "NO_SALE", status: "PENDING", deviceId: req.deviceId, requestedById: ctx.userId, metadata: { reason: req.reason } } });
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId, action: "CASH_DRAWER_NO_SALE_REQUESTED", entityType: "DrawerOperation", entityId: operation.id, metadata: { reason: req.reason, cashSessionId: session.id } } });
      return operation;
    }));
  }

  async createSaleReturn(ctx: TenantContext, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const original = req.originalSaleId ? await tx.sale.findFirst({ where: { id: req.originalSaleId, ...tenantWhere(ctx) }, include: { lines: true } }) : null;
      const count = await tx.return.count({ where: tenantWhere(ctx) });
      const returnNumber = req.returnNumber || `RET-MAIN-${String(count + 1).padStart(6, "0")}`;
      const lines = (req.items || req.lines || []).map((x: any) => ({
        id: x.id || randomUUID(), variantId: x.variantId, quantityReturned: Math.abs(x.quantityReturned ?? x.quantity ?? 0),
        refundUnitPrice: x.refundUnitPrice ?? x.unitPrice ?? 0,
        refundLineTotal: x.refundLineTotal ?? ((x.refundUnitPrice ?? x.unitPrice ?? 0) * Math.abs(x.quantityReturned ?? x.quantity ?? 0)),
        condition: x.condition || "GOOD",
      }));
      const total = lines.reduce((s: number, x: any) => s + Number(x.refundLineTotal || 0), 0);
      const record = await tx.return.create({ data: {
        id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId, returnNumber,
        originalSaleId: original?.id ?? req.originalSaleId ?? null, customerId: req.customerId ?? original?.customerId ?? null,
        reason: req.reason || "Customer return", refundType: req.refundType || "CASH",
        totalRefundAmount: req.totalRefundAmount ?? total, status: "COMPLETED",
        authorizedById: ctx.userId, lines: { create: lines },
      }, include: { lines: true } });
      for (const line of lines) {
        const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, ...tenantWhere(ctx) } });
        if (!variant) throw new Error("RETURN_VARIANT_BOUNDARY_VIOLATION");
        const beforeRow = await tx.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: variant.id } });
        const before = Number(beforeRow._sum.quantityChange ?? 0);
        const change = Number(line.quantityReturned);
        const after = before + change;
        if (after < 0) throw new Error("INVENTORY_AUTHORITY_NEGATIVE_BALANCE");

        await tx.stockLedger.create({ data: {
          tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
          movementType: "RETURN", quantityChange: change, quantity: change,
          quantityBefore: before, quantityAfter: after, unitCost: 0, totalCost: 0, referenceType: "RETURN",
          referenceId: record.id, occurredAt: new Date(), deviceId: req.deviceId || "web",
          operationId: req.operationId || record.id, idempotencyKey: `${req.idempotencyKey || record.id}-${variant.id}`,
        }});
        await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, variant.id);
        await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, variant.id, null);
        await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
      }
      return record;
    }));
  }

  async getReturns(ctx: TenantContext) {
    return normalize(await db.return.findMany({ where: tenantWhere(ctx), include: { lines: true }, orderBy: { createdAt: "desc" } }));
  }

  async openCashSession(ctx: TenantContext, req: any) {
    const existing = await db.cashSession.findFirst({ where: { ...tenantWhere(ctx), cashierId: req.cashierId || ctx.userId, status: { in: ["OPEN","ACTIVE","CLOSE_REQUESTED"] } } });
    if (existing) return normalize(existing);
    const count = await db.cashSession.count({ where: tenantWhere(ctx) });
    return normalize(await db.cashSession.create({ data: {
      id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId,
      sessionNumber: req.sessionNumber || `CS-MAIN-${String(count + 1).padStart(6, "0")}`,
      cashierId: req.cashierId || ctx.userId, openingCash: req.openingCash ?? 0, notes: req.notes ?? null,
      status: "OPEN",
    }}));
  }

  async getActiveCashSession(ctx: TenantContext) {
    const row = await db.cashSession.findFirst({ where: { ...tenantWhere(ctx), status: "OPEN" }, orderBy: { openedAt: "desc" } });
    return normalize(row);
  }

  async sealCashSessionCount(ctx: TenantContext, id: string, req: any) {
    const actualCash = Number(req.actualCash);
    if (!Number.isFinite(actualCash) || actualCash < 0) throw new Error("INVALID_CASH_COUNT");
    return normalize(await db.$transaction(async (tx: any) => {
      const session = await tx.cashSession.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!session) throw new Error("Cash session not found");
      if (session.cashierId !== ctx.userId) throw new Error("CASH_SESSION_AUTHORIZATION_REQUIRED");
      if (session.status === "CLOSED") throw new Error("CASH_SESSION_CLOSED");
      if (session.countSealedAt) throw new Error("CASH_COUNT_ALREADY_SEALED");
      const sealed = await tx.cashSession.update({ where: { id: session.id }, data: { actualCash, closingCash: actualCash, countSealedAt: new Date(), countSealedById: ctx.userId, countSealedDeviceId: req.deviceId || null } });
      return { id: sealed.id, status: sealed.status, actualCash: Number(sealed.actualCash), countSealedAt: sealed.countSealedAt, countSealedById: sealed.countSealedById };
    }));
  }

  async recordExpense(ctx: TenantContext, req: any) {
    return normalize(await this.atomic.recordExpense(ctx, req));
  }

  async createCashMovement(ctx: TenantContext, req: any) {
    const amount = Number(req.amount);
    const allowed = new Set(["CASH_IN", "CASH_OUT", "SAFE_DROP", "BANK_DEPOSIT", "PETTY_CASH"]);
    if (!allowed.has(String(req.type))) throw new Error("INVALID_CASH_MOVEMENT_TYPE");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_CASH_MOVEMENT_AMOUNT");
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.cashMovement.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
      if (existing) return existing;
      const session = await tx.cashSession.findFirst({ where: { id: req.cashSessionId, ...tenantWhere(ctx), status: { not: "CLOSED" } } });
      if (!session || session.cashierId !== ctx.userId) throw new Error("CASH_SESSION_AUTHORIZATION_REQUIRED");
      const movement = await tx.cashMovement.create({ data: { id: req.id || randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, cashSessionId: session.id, type: req.type, amount, reason: String(req.reason || req.type), deviceId: String(req.deviceId || "unknown"), actorId: ctx.userId, witness: req.witness || null, approvalStatus: req.approvalStatus || "APPROVED", idempotencyKey: String(req.idempotencyKey), occurredAt: req.occurredAt ? new Date(req.occurredAt) : new Date() } });
      const inc: any = {};
      if (req.type === "CASH_IN") inc.cashInTotal = { increment: amount };
      else if (req.type === "CASH_OUT") inc.cashOutTotal = { increment: amount };
      else if (req.type === "SAFE_DROP" || req.type === "BANK_DEPOSIT") inc.safeDropTotal = { increment: amount };
      else if (req.type === "PETTY_CASH") inc.cashExpensesTotal = { increment: amount };
      if (Object.keys(inc).length) await tx.cashSession.update({ where: { id: session.id }, data: inc });
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId || "unknown", action: "CASH_MOVEMENT_CREATED", entityType: "CashMovement", entityId: movement.id, metadata: { type: req.type, amount, cashSessionId: session.id, reason: req.reason } } });
      return movement;
    }));
  }

  async getCashMovements(ctx: TenantContext, cashSessionId: string) {
    const session = await db.cashSession.findFirst({ where: { id: cashSessionId, ...tenantWhere(ctx) } });
    if (!session) throw new Error("CASH_SESSION_NOT_FOUND");
    return normalize(await db.cashMovement.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, cashSessionId }, orderBy: { occurredAt: "desc" } }));
  }

  async closeCashSession(ctx: TenantContext, id: string, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await tx.cashSession.findFirst({ where: { id, ...tenantWhere(ctx) } });
      if (!existing) throw new Error("Cash session not found");
      if (existing.cashierId !== ctx.userId) throw new Error("CASH_SESSION_AUTHORIZATION_REQUIRED");
      if (existing.status === "CLOSED") throw new Error("CASH_SESSION_CLOSED");
      if (!existing.countSealedAt || existing.actualCash === null) throw new Error("CASH_COUNT_NOT_SEALED");
      const [cashSales, cashRefunds, cashExpenses, cashMovements] = await Promise.all([
        tx.payment.aggregate({ where: { ...tenantWhere(ctx), paymentMethod: "CASH", status: "COMPLETED", sale: { cashSessionId: id } }, _sum: { amount: true } }),
        tx.return.aggregate({ where: { ...tenantWhere(ctx), refundType: "CASH", status: "COMPLETED", originalSale: { cashSessionId: id } }, _sum: { totalRefundAmount: true } }),
        tx.expense.aggregate({ where: { ...tenantWhere(ctx), cashSessionId: id }, _sum: { amount: true } }),
        tx.cashMovement.groupBy({ by: ["type"], where: { tenantId: ctx.tenantId, branchId: ctx.branchId, cashSessionId: id }, _sum: { amount: true } }),
      ]);
      const cashSalesTotal = Number(cashSales._sum.amount || 0);
      const cashRefundsTotal = Number(cashRefunds._sum.totalRefundAmount || 0);
      const movementTotal = (type: string) => Number((cashMovements.find((row: any) => row.type === type)?._sum?.amount) || 0);
      const cashExpensesTotal = Number(cashExpenses._sum.amount || 0) + movementTotal("PETTY_CASH");
      const cashInTotal = movementTotal("CASH_IN");
      const cashOutTotal = movementTotal("CASH_OUT");
      const safeDropTotal = movementTotal("SAFE_DROP") + movementTotal("BANK_DEPOSIT");
      const expectedCash = Number(existing.openingCash) + cashSalesTotal + cashInTotal - cashRefundsTotal - cashExpensesTotal - cashOutTotal - safeDropTotal;
      const actualCash = Number(existing.actualCash);
      const variance = actualCash - expectedCash;
      const closedAt = new Date();
      const closed = await tx.cashSession.update({ where: { id: existing.id }, data: { closingCash: actualCash, expectedCash, cashSalesTotal, cashRefundsTotal, cashExpensesTotal, cashInTotal, cashOutTotal, safeDropTotal, variance, closedAt, status: "CLOSED", notes: req.notes ?? existing.notes } });
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: existing.countSealedDeviceId || "server", action: "CASH_SESSION_CLOSED", entityType: "CashSession", entityId: existing.id, metadata: { sessionNumber: existing.sessionNumber, openingCash: Number(existing.openingCash), actualCash, expectedCash, variance, cashSalesTotal, cashRefundsTotal, cashExpensesTotal, cashInTotal, cashOutTotal, safeDropTotal, countSealedAt: existing.countSealedAt.toISOString() } } });
      return closed;
    }));
  }

  async getDashboardSummary(ctx: TenantContext) {
    const where = tenantWhere(ctx);
    const [sales, purchases, returns, expenses, customers, products] = await Promise.all([
      db.sale.aggregate({ where, _sum: { grandTotal: true } }),
      db.purchaseOrder.aggregate({ where, _sum: { totalAmount: true } }),
      db.return.aggregate({ where, _sum: { totalRefundAmount: true } }),
      db.expense.aggregate({ where, _sum: { amount: true } }),
      db.customer.count({ where }), db.product.count({ where }),
    ]);
    return { totalSales: Number(sales._sum.grandTotal || 0), totalPurchases: Number(purchases._sum.totalAmount || 0),
      totalReturns: Number(returns._sum.totalRefundAmount || 0), totalExpenses: Number(expenses._sum.amount || 0),
      customerCount: customers, productCount: products };
  }

  async requireEntity(model: string, ctx: TenantContext, id: string) {
    if (!id) throw new Error(`${model} id is required`);
    const row = await db[model].findUnique({ where: { id } });
    if (!row || row.tenantId !== ctx.tenantId || (row.branchId !== undefined && row.branchId !== null && row.branchId !== ctx.branchId)) {
      throw new Error(`${model.toUpperCase()}_BOUNDARY_VIOLATION`);
    }
    return row;
  }
}

export class PrismaWorkforceRepository {
  async getDepartments(ctx: TenantContext) { return normalize(await db.department.findMany({ where: tenantWhere(ctx), orderBy: { name: "asc" } })); }
  async createDepartment(ctx: TenantContext, req: any) { return normalize(await db.department.create({ data: { id:req.id||undefined, tenantId:ctx.tenantId, branchId:req.branchId||ctx.branchId, name:req.name, code:req.code.toUpperCase(), description:req.description??null, managerId:req.managerId??null } })); }
  async getJobPositions(ctx: TenantContext) { return normalize(await db.jobPosition.findMany({ where:{tenantId:ctx.tenantId}, orderBy:{title:"asc"} })); }
  async createJobPosition(ctx: TenantContext, req: any) { return normalize(await db.jobPosition.create({ data: { id:req.id||undefined, tenantId:ctx.tenantId, departmentId:req.departmentId??null, title:req.title, positionCode:req.positionCode.toUpperCase(), jobDescription:req.jobDescription??null, payClassification:req.payClassification||"SALARY", defaultSalary:req.defaultSalary??0, defaultHourlyRate:req.defaultHourlyRate??0, defaultCommissionRate:req.defaultCommissionRate??0, schedulePolicy:req.schedulePolicy??null } })); }

  async getEmployees(ctx: TenantContext) {
    const rows = await db.employee.findMany({ where: tenantWhere(ctx, true), orderBy: { createdAt: "asc" } });
    return rows.map(sanitizeEmployee);
  }

  async getEmployeeById(ctx: TenantContext, id: string) {
    if (!id) throw new Error("EMPLOYEE_ID_REQUIRED");
    const row = await db.employee.findFirst({ where: { id, ...tenantWhere(ctx, true) } });
    return sanitizeEmployee(row);
  }

  private async requireEmployeeEntity(tx: any, ctx: TenantContext, id: string) {
    if (!id) throw new Error("EMPLOYEE_ID_REQUIRED");
    const row = await tx.employee.findFirst({ where: { id, ...tenantWhere(ctx, true) } });
    if (!row) throw new Error("EMPLOYEE_BOUNDARY_VIOLATION");
    return row;
  }

  private async validateEmployeeReferences(tx: any, ctx: TenantContext, input: any, branchId: string, employeeId?: string) {
    if (!employeeCanAccessBranch(ctx, branchId)) throw new Error("EMPLOYEE_BRANCH_FORBIDDEN");
    const branch = await tx.branch.findFirst({ where: { id: branchId, tenantId: ctx.tenantId } });
    if (!branch) throw new Error("EMPLOYEE_BRANCH_INVALID");
    if (input.userId) {
      const user = await tx.user.findFirst({ where: { id: input.userId, tenantId: ctx.tenantId } });
      if (!user || String(user.branchId) !== String(branchId)) throw new Error("EMPLOYEE_USER_INVALID");
      const linked = await tx.employee.findFirst({ where: { tenantId: ctx.tenantId, userId: input.userId, ...(employeeId ? { NOT: { id: employeeId } } : {}) } });
      if (linked) throw new Error("EMPLOYEE_USER_ALREADY_LINKED");
    }
    if (input.departmentId) {
      const department = await tx.department.findFirst({ where: { id: input.departmentId, tenantId: ctx.tenantId, branchId } });
      if (!department) throw new Error("EMPLOYEE_DEPARTMENT_INVALID");
    }
    if (input.positionId) {
      const position = await tx.jobPosition.findFirst({ where: { id: input.positionId, tenantId: ctx.tenantId } });
      if (!position) throw new Error("EMPLOYEE_POSITION_INVALID");
      if (input.departmentId && position.departmentId && String(position.departmentId) !== String(input.departmentId)) throw new Error("EMPLOYEE_POSITION_DEPARTMENT_MISMATCH");
    }
    if (input.managerId) {
      const manager = await tx.employee.findFirst({ where: { id: input.managerId, tenantId: ctx.tenantId, branchId } });
      if (!manager || String(manager.id) === String(employeeId || "")) throw new Error("EMPLOYEE_MANAGER_INVALID");
    }
    return branch;
  }

  async createEmployee(ctx: TenantContext, req: any) {
    const branchId = String(req.branchId || ctx.branchId);
    return normalize(await db.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `kwakopos:employee-number:${ctx.tenantId}`);
      await this.validateEmployeeReferences(tx, ctx, req, branchId);
      const count = await tx.employee.count({ where: { tenantId: ctx.tenantId } });
      const number = String(req.employeeNumber || `EMP-${String(count + 1).padStart(4, "0")}`).trim().toUpperCase();
      if (await tx.employee.findFirst({ where: { tenantId: ctx.tenantId, employeeNumber: number } })) throw new Error("EMPLOYEE_NUMBER_EXISTS");
      const employee = await tx.employee.create({ data: {
        id: req.id || undefined, tenantId: ctx.tenantId, branchId, userId: req.userId ?? null,
        employeeNumber: number, firstName: req.firstName.trim(), lastName: req.lastName.trim(),
        preferredName: req.preferredName?.trim() || null, phone: req.phone?.trim() || null,
        email: req.email?.trim().toLowerCase() || null, address: req.address?.trim() || null,
        emergencyContact: req.emergencyContact?.trim() || null, dateOfBirth: req.dateOfBirth ? new Date(req.dateOfBirth) : null,
        hireDate: req.hireDate ? new Date(req.hireDate) : undefined, departmentId: req.departmentId ?? null,
        positionId: req.positionId ?? null, managerId: req.managerId ?? null, workType: req.workType || "FULL_TIME",
        contractType: req.contractType || "PERMANENT", baseSalary: req.baseSalary ?? 0, hourlyRate: req.hourlyRate ?? 0,
        commissionRate: req.commissionRate ?? 0, pinCodeHash: req.pinCode ? EmployeeEngine.hashPin(req.pinCode) : null,
        profilePhotoUrl: null,
      }});
      const initialRecord = await tx.employmentRecord.create({ data: {
        tenantId: ctx.tenantId, employeeId: employee.id, effectiveDate: employee.hireDate, changeType: "HIRE",
        departmentId: employee.departmentId, positionId: employee.positionId, branchId: employee.branchId,
        managerId: employee.managerId, contractType: employee.contractType,
        payRate: employee.baseSalary ?? employee.hourlyRate ?? null, createdById: ctx.userId, reason: "Initial employment",
      }});
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId, userId: ctx.userId, deviceId: "employee-service",
        action: "EMPLOYEE_CREATED", entityType: "Employee", entityId: employee.id,
        metadata: { employeeNumber: number, userId: employee.userId, branchId },
      }});
      return { employee: sanitizeEmployee(employee), initialRecord: normalize(initialRecord) };
    }).catch((error: any) => {
      if (error?.code === "P2002") throw new Error("EMPLOYEE_NUMBER_EXISTS");
      throw error;
    }));
  }

  async updateEmployee(ctx: TenantContext, id: string, req: any, reason?: string) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await this.requireEmployeeEntity(tx, ctx, id);
      const branchId = req.branchId === undefined || req.branchId === null ? String(existing.branchId || ctx.branchId) : String(req.branchId);
      await this.validateEmployeeReferences(tx, ctx, { ...req, userId: undefined }, branchId, id);
      const data = pick(req, ["firstName","lastName","preferredName","phone","email","address","emergencyContact","departmentId","positionId","branchId","managerId","status","workType","contractType","baseSalary","hourlyRate","commissionRate","profilePhotoUrl"]);
      for (const key of ["firstName","lastName","preferredName","phone","email","address","emergencyContact"]) {
        if (data[key] !== undefined && typeof data[key] === "string") data[key] = data[key].trim();
      }
      if (data.email) data.email = data.email.toLowerCase();
      data.branchId = branchId;
      if (data.status === "TERMINATED" || data.status === "ARCHIVED") data.terminationDate = existing.terminationDate || new Date();
      else if (data.status === "ACTIVE" && existing.status === "TERMINATED") data.terminationDate = null;
      const positionChanged = data.positionId !== undefined && String(data.positionId || "") !== String(existing.positionId || "");
      const departmentChanged = data.departmentId !== undefined && String(data.departmentId || "") !== String(existing.departmentId || "");
      const branchChanged = String(branchId) !== String(existing.branchId || "");
      const payChanged = (data.baseSalary !== undefined && Number(data.baseSalary) !== Number(existing.baseSalary || 0)) || (data.hourlyRate !== undefined && Number(data.hourlyRate) !== Number(existing.hourlyRate || 0)) || (data.commissionRate !== undefined && Number(data.commissionRate) !== Number(existing.commissionRate || 0));
      const statusChanged = data.status !== undefined && String(data.status) !== String(existing.status);
      const contractChanged = data.contractType !== undefined && String(data.contractType) !== String(existing.contractType || "");
      const updated = await tx.employee.update({ where: { id }, data });
      if (positionChanged || departmentChanged || branchChanged || payChanged || statusChanged || contractChanged || Boolean(reason)) {
        let changeType = "STATUS_CHANGE";
        if (statusChanged && data.status === "TERMINATED") changeType = "TERMINATION";
        else if (positionChanged) changeType = "PROMOTION";
        else if (branchChanged || departmentChanged) changeType = "TRANSFER";
        else if (payChanged) changeType = "PAY_ADJUSTMENT";
        await tx.employmentRecord.updateMany({ where: { tenantId: ctx.tenantId, employeeId: id, endDate: null }, data: { endDate: new Date() } });
        await tx.employmentRecord.create({ data: {
          tenantId: ctx.tenantId, employeeId: id, effectiveDate: new Date(), changeType,
          departmentId: updated.departmentId, positionId: updated.positionId, branchId: updated.branchId, managerId: updated.managerId,
          contractType: updated.contractType, payRate: updated.baseSalary ?? updated.hourlyRate ?? null,
          reason: reason || `Updated via ${changeType}`, createdById: ctx.userId,
        }});
      }
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: String(updated.branchId || ctx.branchId),
        userId: ctx.userId, deviceId: "employee-service", action: "EMPLOYEE_UPDATED", entityType: "Employee", entityId: id,
        metadata: { changedFields: Object.keys(data), reason: reason || null },
      }});
      return sanitizeEmployee(updated);
    }));
  }

  async archiveEmployee(ctx: TenantContext, id: string, reason?: string) {
    return normalize(await db.$transaction(async (tx: any) => {
      const existing = await this.requireEmployeeEntity(tx, ctx, id);
      if (existing.status === "ARCHIVED") return sanitizeEmployee(existing);
      const updated = await tx.employee.update({ where: { id }, data: { status: "ARCHIVED", terminationDate: existing.terminationDate || new Date() } });
      await tx.employmentRecord.updateMany({ where: { tenantId: ctx.tenantId, employeeId: id, endDate: null }, data: { endDate: new Date() } });
      await tx.employmentRecord.create({ data: {
        tenantId: ctx.tenantId, employeeId: id, effectiveDate: new Date(), changeType: "STATUS_CHANGE",
        departmentId: updated.departmentId, positionId: updated.positionId, branchId: updated.branchId, managerId: updated.managerId,
        contractType: updated.contractType, payRate: updated.baseSalary ?? updated.hourlyRate ?? null,
        reason: reason || "Employee archived", createdById: ctx.userId,
      }});
      await tx.auditEvent.create({ data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: String(updated.branchId || ctx.branchId),
        userId: ctx.userId, deviceId: "employee-service", action: "EMPLOYEE_ARCHIVED", entityType: "Employee", entityId: id,
        metadata: { reason: reason || null },
      }});
      return sanitizeEmployee(updated);
    }));
  }

  async getEmploymentHistory(ctx: TenantContext, id: string) {
    const employee = await this.requireEmployeeEntity(db, ctx, id);
    return normalize(await db.employmentRecord.findMany({ where: { tenantId: ctx.tenantId, employeeId: employee.id }, orderBy: { effectiveDate: "asc" } }));
  }

  async getShiftTemplates(ctx:TenantContext){return normalize(await db.shiftTemplate.findMany({where:tenantWhere(ctx),orderBy:{name:"asc"}}));}
  async createShiftTemplate(ctx:TenantContext,req:any){return normalize(await db.shiftTemplate.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:req.branchId||ctx.branchId,departmentId:req.departmentId??null,name:req.name,startTime:req.startTime,endTime:req.endTime,breakDurationMinutes:req.breakDurationMinutes??60,workdays:req.workdays||[],requiredHeadcount:req.requiredHeadcount??1}}));}
  async getSchedules(ctx:TenantContext){return normalize(await db.workforceSchedule.findMany({where:tenantWhere(ctx),orderBy:{date:"asc"}}));}
  async createSchedule(ctx:TenantContext,req:any){return normalize(await db.workforceSchedule.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,shiftTemplateId:req.shiftTemplateId??null,date:new Date(req.date),startTime:req.startTime,endTime:req.endTime,status:req.status||"PUBLISHED",notes:req.notes??null}}));}

  async getAttendanceRecords(ctx:TenantContext){return normalize(await db.attendanceRecord.findMany({where:tenantWhere(ctx),orderBy:{workDate:"desc"}}));}
  async clockIn(ctx:TenantContext,req:any){
    const existing=await db.attendanceRecord.findUnique({where:{tenantId_idempotencyKey:{tenantId:ctx.tenantId,idempotencyKey:req.idempotencyKey}}}).catch(()=>null);
    if(existing)return normalize(existing);
    return normalize(await db.attendanceRecord.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,scheduleId:req.scheduleId??null,workDate:req.workDate?new Date(req.workDate):new Date(),clockIn:req.clockIn?new Date(req.clockIn):new Date(),breakMinutes:req.breakMinutes??0,status:req.status||"PRESENT",method:req.method||"STANDARD",pinVerified:req.pinVerified||false,qrCode:req.qrCode??null,latitude:req.latitude??null,longitude:req.longitude??null,deviceId:req.deviceId??null,idempotencyKey:req.idempotencyKey,supervisorApproved:false}}));
  }
  async clockOut(ctx:TenantContext,id:string,req:any){
    const existing=await this.requireEntity("attendanceRecord",ctx,id);
    const out=req.clockOut?new Date(req.clockOut):new Date();
    const minutes=Math.max(0,Math.floor((out.getTime()-new Date(existing.clockIn).getTime())/60000));
    return normalize(await db.attendanceRecord.update({where:{id},data:{clockOut:out,regularMinutes:minutes,status:req.status||existing.status,breakMinutes:req.breakMinutes??existing.breakMinutes}}));
  }

  async getTimesheets(ctx:TenantContext){return normalize(await db.timesheet.findMany({where:tenantWhere(ctx),orderBy:{periodStart:"desc"}}));}
  async generateTimesheet(ctx:TenantContext,req:any){
    const attend=await db.attendanceRecord.findMany({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,workDate:{gte:new Date(req.periodStart),lte:new Date(req.periodEnd)}}});
    const total=attend.reduce((s:number,a:any)=>s+Number(a.regularMinutes||0)+Number(a.overtimeMinutes||0),0);
    return normalize(await db.timesheet.upsert({where:{tenantId_employeeId_periodStart_periodEnd:{tenantId:ctx.tenantId,employeeId:req.employeeId,periodStart:new Date(req.periodStart),periodEnd:new Date(req.periodEnd)}},
      create:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,periodStart:new Date(req.periodStart),periodEnd:new Date(req.periodEnd),totalWorkedMinutes:total,totalRegularMinutes:total,status:"DRAFT"},
      update:{totalWorkedMinutes:total,totalRegularMinutes:total,updatedAt:new Date()}}));
  }
  async approveTimesheet(ctx:TenantContext,id:string){await this.requireEntity("timesheet",ctx,id);return normalize(await db.timesheet.update({where:{id},data:{status:"APPROVED",approvedAt:new Date(),approvedById:ctx.userId}}));}

  async getLeaveTypes(ctx:TenantContext){return normalize(await db.leaveType.findMany({where:{tenantId:ctx.tenantId},orderBy:{name:"asc"}}));}
  async createLeaveType(ctx:TenantContext,req:any){return normalize(await db.leaveType.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,name:req.name,code:req.code,isPaid:req.isPaid??true,defaultAllowanceDays:req.defaultAllowanceDays??21,requiresProof:req.requiresProof??false}}));}
  async getLeaveRequests(ctx:TenantContext){return normalize(await db.leaveRequest.findMany({where:tenantWhere(ctx),orderBy:{startDate:"desc"}}));}
  async requestLeave(ctx:TenantContext,req:any){return normalize(await db.leaveRequest.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,leaveTypeId:req.leaveTypeId,startDate:new Date(req.startDate),endDate:new Date(req.endDate),totalDays:req.totalDays??0,partialDay:req.partialDay??null,reason:req.reason??null,status:"PENDING",documentUrl:req.documentUrl??null}}));}
  async approveLeave(ctx:TenantContext,id:string,approved:boolean,reason?:string){await this.requireEntity("leaveRequest",ctx,id);return normalize(await db.leaveRequest.update({where:{id},data:{status:approved?"APPROVED":"REJECTED",approvedById:approved?ctx.userId:null,approvedAt:approved?new Date():null,rejectionReason:approved?null:(reason||null)}}));}

  async getTasks(ctx:TenantContext){return normalize(await db.workforceTask.findMany({where:tenantWhere(ctx),orderBy:{createdAt:"desc"}}));}
  async createTask(ctx:TenantContext,req:any){return normalize(await db.workforceTask.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,title:req.title,description:req.description??null,taskType:req.taskType||"GENERAL",priority:req.priority||"MEDIUM",status:req.status||"BACKLOG",assignedEmployeeId:req.assignedEmployeeId??null,assignedTeam:req.assignedTeam??null,dueDate:req.dueDate?new Date(req.dueDate):null,checklist:req.checklist||[],attachments:req.attachments||[],relatedEntityType:req.relatedEntityType??null,relatedEntityId:req.relatedEntityId??null}}));}
  async updateTask(ctx:TenantContext,id:string,req:any){await this.requireEntity("workforceTask",ctx,id);return normalize(await db.workforceTask.update({where:{id},data:pick(req,["title","description","taskType","priority","status","assignedEmployeeId","assignedTeam","dueDate","checklist","attachments","relatedEntityType","relatedEntityId","completedAt","verifiedById","verifiedAt"])}));}
  async getWorkOrders(ctx:TenantContext){return normalize(await db.workOrder.findMany({where:tenantWhere(ctx),orderBy:{createdAt:"desc"}}));}
  async createWorkOrder(ctx:TenantContext,req:any){const c=await db.workOrder.count({where:tenantWhere(ctx)});return normalize(await db.workOrder.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,workOrderNumber:req.workOrderNumber||`WO-${String(c+1).padStart(6,"0")}`,customerId:req.customerId??null,projectId:req.projectId??null,title:req.title,description:req.description??null,priority:req.priority||"MEDIUM",status:req.status||"DRAFT",scheduledStart:req.scheduledStart?new Date(req.scheduledStart):null,scheduledEnd:req.scheduledEnd?new Date(req.scheduledEnd):null,assignedEmployeeId:req.assignedEmployeeId??null,laborHours:req.laborHours??0,laborRate:req.laborRate??0,laborCostTotal:req.laborCostTotal??0,materialsCostTotal:req.materialsCostTotal??0,grandTotal:req.grandTotal??0,notes:req.notes??null,approvedById:req.approvedById??null,approvedAt:req.approvedAt?new Date(req.approvedAt):null}}));}
  async updateWorkOrder(ctx:TenantContext,id:string,req:any){await this.requireEntity("workOrder",ctx,id);return normalize(await db.workOrder.update({where:{id},data:pick(req,["title","description","priority","status","scheduledStart","scheduledEnd","assignedEmployeeId","laborHours","laborRate","laborCostTotal","materialsCostTotal","grandTotal","notes","approvedById","approvedAt"])}));}

  async getSkills(ctx:TenantContext,id:string){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employeeSkill.findMany({where:{tenantId:ctx.tenantId,employeeId:id}}));}
  async addSkill(ctx:TenantContext,id:string,req:any){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employeeSkill.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,employeeId:id,skillName:req.skillName,proficiencyLevel:req.proficiencyLevel||"INTERMEDIATE",yearsExperience:req.yearsExperience??null}}));}
  async getCertifications(ctx:TenantContext,id?:string){return normalize(await db.employeeCertification.findMany({where:{tenantId:ctx.tenantId,...(id?{employeeId:id}:{})},orderBy:{expiryDate:"asc"}}));}
  async addCertification(ctx:TenantContext,id:string,req:any){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employeeCertification.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,employeeId:id,certificationName:req.certificationName,issuingBody:req.issuingBody,certificateNumber:req.certificateNumber??null,issueDate:new Date(req.issueDate),expiryDate:req.expiryDate?new Date(req.expiryDate):null,isVerified:req.isVerified||false,verifiedById:req.verifiedById??null,verifiedAt:req.verifiedAt?new Date(req.verifiedAt):null,documentUrl:req.documentUrl??null}}));}
  async getPerformanceReviews(ctx:TenantContext,id?:string){return normalize(await db.performanceReview.findMany({where:{tenantId:ctx.tenantId,...(id?{employeeId:id}:{})},orderBy:{createdAt:"desc"}}));}
  async createPerformanceReview(ctx:TenantContext,req:any){return normalize(await db.performanceReview.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,reviewerId:req.reviewerId||ctx.userId,reviewPeriod:req.reviewPeriod,rating:req.rating,strengths:req.strengths??null,improvements:req.improvements??null,goals:req.goals||[],status:req.status||"COMPLETED",submittedAt:req.submittedAt?new Date(req.submittedAt):new Date(),acknowledgedAt:req.acknowledgedAt?new Date(req.acknowledgedAt):null}}));}
  async getCommissions(ctx:TenantContext){return normalize(await db.commissionRecord.findMany({where:tenantWhere(ctx),orderBy:{createdAt:"desc"}}));}
  async recordCommission(ctx:TenantContext,req:any){const amount=req.commissionAmount??(Number(req.salesAmount||0)*Number(req.commissionRate||0)/100);return normalize(await db.commissionRecord.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,saleId:req.saleId??null,workOrderId:req.workOrderId??null,period:req.period,salesAmount:req.salesAmount||0,commissionRate:req.commissionRate||0,commissionAmount:amount,status:"PENDING"}}));}
  async approveCommission(ctx:TenantContext,id:string){await this.requireEntity("commissionRecord",ctx,id);return normalize(await db.commissionRecord.update({where:{id},data:{status:"APPROVED",approvedById:ctx.userId,approvedAt:new Date()}}));}
  async getPayrollInputs(ctx:TenantContext){return normalize(await db.payrollInput.findMany({where:tenantWhere(ctx),orderBy:{periodStart:"desc"}}));}
  async generatePayrollInputFromTimesheet(ctx:TenantContext,employeeId:string,timesheetId:string){const ts=await db.timesheet.findFirst({where:{id:timesheetId,...tenantWhere(ctx)}});if(!ts||ts.employeeId!==employeeId)throw new Error("TIMESHEET_BOUNDARY_VIOLATION");const emp=await db.employee.findFirst({where:{id:employeeId,tenantId:ctx.tenantId}});const regularHours=Number(ts.totalRegularMinutes||0)/60;const overtimeHours=Number(ts.totalOvertimeMinutes||0)/60;const regularPay=regularHours*Number(emp?.hourlyRate||0);const overtimePay=overtimeHours*Number(emp?.hourlyRate||0)*1.5;return normalize(await db.payrollInput.upsert({where:{tenantId_employeeId_periodStart_periodEnd:{tenantId:ctx.tenantId,employeeId,periodStart:ts.periodStart,periodEnd:ts.periodEnd}},create:{id:undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId,periodStart:ts.periodStart,periodEnd:ts.periodEnd,basicHours:regularHours,overtimeHours,regularPay,overtimePay,grossPay:regularPay+overtimePay,status:"CALCULATED"},update:{basicHours:regularHours,overtimeHours,regularPay,overtimePay,grossPay:regularPay+overtimePay}}));}
  async approvePayrollInput(ctx:TenantContext,id:string){await this.requireEntity("payrollInput",ctx,id);return normalize(await db.payrollInput.update({where:{id},data:{status:"APPROVED",approvedById:ctx.userId,approvedAt:new Date()}}));}
  async getDashboardSummary(ctx:TenantContext){const w=tenantWhere(ctx);const [employees,active,attendance,timesheets]=await Promise.all([db.employee.count({where:{tenantId:ctx.tenantId}}),db.employee.count({where:{tenantId:ctx.tenantId,status:"ACTIVE"}}),db.attendanceRecord.count({where:w}),db.timesheet.count({where:w})]);return {totalEmployees:employees,activeEmployees:active,attendanceRecords:attendance,timesheets};}
  async getAnalyticsReport(ctx:TenantContext,period="2026-08"){const commissions=await db.commissionRecord.aggregate({where:{...tenantWhere(ctx),period},_sum:{commissionAmount:true,salesAmount:true}});return {period,totalSales:Number(commissions._sum.salesAmount||0),totalCommission:Number(commissions._sum.commissionAmount||0)};}

  private async requireEntity(model:string,ctx:TenantContext,id:string,branch=true){const row=await db[model].findUnique({where:{id}});if(!row||row.tenantId!==ctx.tenantId||((branch&&row.branchId!=null)&&row.branchId!==ctx.branchId))throw new Error(`${model.toUpperCase()}_BOUNDARY_VIOLATION`);return row;}
}

export class PrismaPluginRepository {
  async activatePlugin(ctx:TenantContext,pluginId:string,pluginVersion:string,configuration:any={}) {
    return normalize(await db.pluginActivation.upsert({where:{tenantId_pluginId:{tenantId:ctx.tenantId,pluginId}},create:{id:randomUUID(),tenantId:ctx.tenantId,pluginId,pluginVersion,state:"ACTIVE",enabledAt:new Date(),configuration},update:{pluginVersion,state:"ACTIVE",enabledAt:new Date(),disabledAt:null,configuration}}));
  }
  async deactivatePlugin(ctx:TenantContext,pluginId:string){const row=await db.pluginActivation.findUnique({where:{tenantId_pluginId:{tenantId:ctx.tenantId,pluginId}}});if(!row)throw new Error("Plugin activation not found");return normalize(await db.pluginActivation.update({where:{id:row.id},data:{state:"DISABLED",disabledAt:new Date()}}));}
  async getTenantActivations(ctx:TenantContext){return normalize(await db.pluginActivation.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"asc"}}));}
  async isPluginActive(ctx:TenantContext,pluginId:string){const row=await db.pluginActivation.findUnique({where:{tenantId_pluginId:{tenantId:ctx.tenantId,pluginId}}});return !!row&&["ACTIVE","ENABLED"].includes(row.state);}
  async setBranchPluginConfig(ctx:TenantContext,pluginId:string,config:any){return normalize(await db.branchPluginConfig.upsert({where:{tenantId_branchId_pluginId:{tenantId:ctx.tenantId,branchId:ctx.branchId,pluginId}},create:{id:randomUUID(),tenantId:ctx.tenantId,branchId:ctx.branchId,pluginId,isEnabled:config.isEnabled!==false,configuration:config.configuration||config},update:{isEnabled:config.isEnabled!==false,configuration:config.configuration||config}}));}
  async setConfigEntry(ctx:TenantContext,entry:any){const key=entry.key;const scope=entry.scope||"TENANT";const existing=await db.pluginConfigEntry.findFirst({where:{tenantId:ctx.tenantId,pluginId:entry.pluginId,scope,key}});return normalize(existing?await db.pluginConfigEntry.update({where:{id:existing.id},data:{value:entry.value,version:{increment:1}}}):await db.pluginConfigEntry.create({data:{id:entry.id||randomUUID(),tenantId:ctx.tenantId,branchId:ctx.branchId,userId:entry.userId??null,pluginId:entry.pluginId,scope,key,value:entry.value,version:1}}));}
  async getConfigEntries(ctx:TenantContext,pluginId:string){return normalize(await db.pluginConfigEntry.findMany({where:{pluginId,OR:[{tenantId:null},{tenantId:ctx.tenantId}],AND:[{OR:[{branchId:null},{branchId:ctx.branchId}]}]}}));}
  async logPluginEvent(ctx:TenantContext,event:any){return normalize(await db.pluginEventLog.create({data:{id:randomUUID(),tenantId:ctx.tenantId,branchId:ctx.branchId,pluginId:event.pluginId,eventType:event.eventType,entityType:event.entityType??null,entityId:event.entityId??null,operationId:event.operationId||randomUUID(),idempotencyKey:event.idempotencyKey||randomUUID(),payload:event.payload||{},actorId:event.actorId||ctx.userId}}));}
  async recordUsage(ctx:TenantContext,pluginId:string,metricName:string,quantity:number){return this.logPluginEvent(ctx,{pluginId,eventType:"USAGE_RECORDED",entityType:"PluginUsageRecord",payload:{metricName,quantity},actorId:ctx.userId});}
  async createSpecialized(ctx:TenantContext,model:string,payload:any){
    const { id: requestedId, tenantId: _tenantId, branchId: _branchId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = payload || {};
    return normalize(await db[model].create({ data: { id: requestedId || undefined, tenantId:ctx.tenantId, branchId:ctx.branchId, ...fields } }));
  }
  async createRestaurantTable(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"restaurantTableRecord",req);}
  async getRestaurantTables(ctx:TenantContext){return normalize(await db.restaurantTableRecord.findMany({where:tenantWhere(ctx),orderBy:{tableNumber:"asc"}}));}
  async createKitchenTicket(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"kitchenTicketRecord",req);}
  async createGarageVehicle(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"garageVehicleRecord",req);}
  async createGarageWorkOrder(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"garageWorkOrderRecord",req);}
  async createConstructionProject(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"constructionProjectRecord",req);}
  async createTelecomSite(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"telecomSiteRecord",req);}
  async createPrescription(ctx:TenantContext,req:any){return this.logPluginEvent(ctx,{pluginId:"pharmacy",eventType:"PRESCRIPTION_CREATED",entityType:"PharmacyPrescription",entityId:req.id||randomUUID(),payload:req,actorId:ctx.userId});}
  async getPrescriptions(ctx:TenantContext){const rows=await db.pluginEventLog.findMany({where:{tenantId:ctx.tenantId,pluginId:"pharmacy",eventType:"PRESCRIPTION_CREATED"},orderBy:{timestamp:"desc"}});return rows.map((r:any)=>normalize(r.payload));}
  async setWholesaleTierRule(ctx:TenantContext,req:any){return this.logPluginEvent(ctx,{pluginId:"wholesale",eventType:"TIER_RULE_SET",entityType:"WholesaleProductTierRule",entityId:req.variantId||req.productId||req.id||randomUUID(),payload:req,actorId:ctx.userId});}
  async getWholesaleTierRule(ctx:TenantContext,variantId:string){const row=await db.pluginEventLog.findFirst({where:{tenantId:ctx.tenantId,pluginId:"wholesale",eventType:"TIER_RULE_SET",entityId:variantId},orderBy:{timestamp:"desc"}});return row?normalize(row.payload):null;}
}

export class PrismaTelecomRepository {
  private where(ctx:TenantContext){return {tenantId:ctx.tenantId};}
  private withBranch(ctx:TenantContext){return {tenantId:ctx.tenantId,branchId:ctx.branchId};}
  async create(model:string,ctx:TenantContext,input:any){
    const { id, tenantId: _tenantId, branchId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = input || {};
    return normalize(await db[model].create({
      data: { id: id || undefined, tenantId: ctx.tenantId, branchId: branchId ?? ctx.branchId, ...fields },
    }));
  }
  async createContract(ctx:TenantContext,input:any){return this.create("telecomCustomerContractRecord",ctx,input);}
  async getContracts(ctx:TenantContext){return normalize(await db.telecomCustomerContractRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async createProject(ctx:TenantContext,input:any){return this.create("telecomProjectRecord",ctx,input);}
  async getProjects(ctx:TenantContext){return normalize(await db.telecomProjectRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async getProjectById(ctx:TenantContext,id:string){return normalize(await db.telecomProjectRecord.findFirst({where:{id,tenantId:ctx.tenantId}}));}
  async createSite(ctx:TenantContext,input:any){return this.create("telecomSiteRecord",ctx,input);}
  async getSites(ctx:TenantContext){return normalize(await db.telecomSiteRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async getSiteById(ctx:TenantContext,id:string){return normalize(await db.telecomSiteRecord.findFirst({where:{id,tenantId:ctx.tenantId}}));}
  async searchSitesNear(ctx:TenantContext,lat:number,lon:number,radiusKm:number){const sites=await this.getSites(ctx);return sites.filter((s:any)=>{const dlat=(Number(s.latitude)-lat)*111;const dlon=(Number(s.longitude)-lon)*111*Math.cos(lat*Math.PI/180);return Math.sqrt(dlat*dlat+dlon*dlon)<=radiusKm;});}
  async createRanSector(ctx:TenantContext,input:any){return this.create("telecomRanSectorRecord",ctx,input);}
  async getRanSectorsBySite(ctx:TenantContext,siteId:string){return normalize(await db.telecomRanSectorRecord.findMany({where:{tenantId:ctx.tenantId,siteId},orderBy:{sectorIndex:"asc"}}));}
  async getRanSectors(ctx:TenantContext){return normalize(await db.telecomRanSectorRecord.findMany({where:{tenantId:ctx.tenantId},orderBy:{sectorIndex:"asc"}}));}
  async createMicrowaveLink(ctx:TenantContext,input:any){return this.create("telecomMicrowaveLinkRecord",ctx,input);}
  async getMicrowaveLinks(ctx:TenantContext){return normalize(await db.telecomMicrowaveLinkRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async createWorkOrder(ctx:TenantContext,input:any){return this.create("telecomWorkOrderRecord",ctx,input);}
  async getWorkOrders(ctx:TenantContext){return normalize(await db.telecomWorkOrderRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async completeWorkOrder(ctx:TenantContext,id:string,notes?:string){const row=await db.telecomWorkOrderRecord.findFirst({where:{id,tenantId:ctx.tenantId}});if(!row)throw new Error("Telecom work order not found");return normalize(await db.telecomWorkOrderRecord.update({where:{id},data:{status:"COMPLETED",completionNotes:notes||null,actualEndTime:new Date()}}));}
  async recordTest(ctx:TenantContext,input:any){return this.create("telecomTestRecordModel",ctx,input);}
  async createSiteAcceptance(ctx:TenantContext,input:any){return this.create("telecomAcceptanceRecordModel",ctx,input);}
  async createMaintenanceTicket(ctx:TenantContext,input:any){return this.create("telecomMaintenanceTicketRecord",ctx,input);}
  async getMaintenanceTickets(ctx:TenantContext){return normalize(await db.telecomMaintenanceTicketRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async createKmlImport(ctx:TenantContext,input:any){
    const parsedPlacemarks = Array.isArray(input?.parsedPlacemarks) ? input.parsedPlacemarks : [];
    return normalize(await db.telecomKmlImportRecord.create({
      data: {
        id: input?.id || randomUUID(),
        tenantId: ctx.tenantId,
        fileName: input?.fileName || "import.kml",
        fileType: input?.fileType || "KML",
        fileSizeBytes: Number(input?.fileSizeBytes || 0),
        sha256Hash: String(input?.sha256Hash || ""),
        totalPlacemarksParsed: Number(input?.totalPlacemarksParsed ?? parsedPlacemarks.length),
        sitesCreated: Number(input?.sitesCreated || 0),
        parsedPlacemarks,
        importedById: ctx.userId,
        importedAt: input?.importedAt ? new Date(input.importedAt) : new Date(),
        status: input?.status || "PARSED_PREVIEW",
        errorMessage: input?.errorMessage ?? null,
      },
    }));
  }
  async getKmlImport(ctx:TenantContext,id:string){return normalize(await db.telecomKmlImportRecord.findFirst({where:{id,tenantId:ctx.tenantId}}));}
  async importKmlPlacemarksAsSites(ctx:TenantContext,importRecordId:string,selectedPlacemarkIds:string[]){
    const record = await db.telecomKmlImportRecord.findFirst({ where: { id: importRecordId, tenantId: ctx.tenantId } });
    if (!record) throw new Error(`KML import record ${importRecordId} not found.`);
    const placemarks = Array.isArray(record.parsedPlacemarks) ? record.parsedPlacemarks as any[] : [];
    const selected = new Set((selectedPlacemarkIds || []).map(String));
    const createdSites: any[] = [];
    for (const p of placemarks.filter((item:any) => selected.has(String(item.id)))) {
      const coords = Array.isArray(p.coordinates) ? p.coordinates : p.coordinate ? [p.coordinate] : [];
      if (!coords.length) continue;
      const coord = coords[0];
      createdSites.push(await this.createSite(ctx, {
        siteCode: `SITE-${randomUUID().slice(0, 5).toUpperCase()}`,
        name: p.name,
        siteType: "GREENFIELD_TOWER",
        status: "PLANNED",
        latitude: coord.latitude,
        longitude: coord.longitude,
        elevationMeters: coord.elevationMeters || 0,
        towerHeightMeters: 45,
        region: "National",
        district: p.layerName || "General",
        address: p.description || "",
        powerSource: "GRID_COMMERCIAL",
        photos: [],
        documents: [],
      }));
    }
    const updated = await db.telecomKmlImportRecord.update({
      where: { id: importRecordId },
      data: { sitesCreated: Number(record.sitesCreated || 0) + createdSites.length, status: "IMPORTED" },
    });
    return { createdSites, importRecord: normalize(updated) };
  }
}

export class PrismaMonetizationRepository {
  private scope(ctx?:TenantContext){return ctx?.tenantId||"GLOBAL";}
  private async get(ctx:TenantContext|undefined,type:string,key:string){const row=await db.saasDataRecord.findFirst({where:{scopeKey:this.scope(ctx),entityType:type,recordKey:key}});return row?normalize(row.payload):null;}
  private async put(ctx:TenantContext|undefined,type:string,key:string,payload:any){const scopeKey=this.scope(ctx);return normalize((await db.saasDataRecord.upsert({where:{scopeKey_entityType_recordKey:{scopeKey,entityType:type,recordKey:key}},create:{id:randomUUID(),scopeKey,entityType:type,recordKey:key,payload,status:String(payload.status||"ACTIVE")},update:{payload,status:String(payload.status||"ACTIVE"),updatedAt:new Date()}})).payload);}
  async getPlans(){const rows=await db.saasDataRecord.findMany({where:{scopeKey:"GLOBAL",entityType:"PLAN",status:"ACTIVE"},orderBy:{createdAt:"asc"}});return rows.map((r:any)=>normalize(r.payload));}
  async getPlanById(id:string){return this.get(undefined,"PLAN",id);}
  async createPlan(req:any){const id=req.id||randomUUID();return this.put(undefined,"PLAN",id,{...req,id,status:"ACTIVE",version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
  async getSubscription(ctx:TenantContext){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"SUBSCRIPTION"},orderBy:{updatedAt:"desc"},take:1});return rows[0]?normalize(rows[0].payload):null;}
  async createSubscription(ctx:TenantContext,req:any){const plan=await this.getPlanById(req.planId);if(!plan)throw new Error("Plan not found");const now=new Date().toISOString();const id=randomUUID();return this.put(ctx,"SUBSCRIPTION",id,{...req,id,tenantId:ctx.tenantId,planId:plan.id,planCode:plan.code,planVersion:plan.version,status:req.startTrial&&plan.trialEligibility?"TRIAL":"ACTIVE",currency:req.currency||plan.currency,basePrice:plan.basePrice,currentPeriodPrice:plan.basePrice,startDate:now,currentPeriodStart:now,updatedAt:now,createdAt:now});}
  async changePlan(ctx:TenantContext,id:string,req:any){const sub=await this.get(ctx,"SUBSCRIPTION",id);if(!sub)throw new Error("Subscription not found");const plan=await this.getPlanById(req.planId);if(!plan)throw new Error("Plan not found");return this.put(ctx,"SUBSCRIPTION",id,{...sub,...req,planId:plan.id,planCode:plan.code,planVersion:plan.version,updatedAt:new Date().toISOString()});}
  async cancelSubscription(ctx:TenantContext,id:string,reason:string){const sub=await this.get(ctx,"SUBSCRIPTION",id);if(!sub)throw new Error("Subscription not found");return this.put(ctx,"SUBSCRIPTION",id,{...sub,status:"CANCELLED",cancelledAt:new Date().toISOString(),cancelReason:reason,updatedAt:new Date().toISOString()});}
  async checkEntitlement(ctx:TenantContext,featureKey:string,currentUsage?:number){const sub=await this.getSubscription(ctx);if(!sub)return {allowed:false,reason:"NO_ACTIVE_SUBSCRIPTION",featureKey};const plan=await this.getPlanById(sub.planId);const allowed=!!plan&&Array.isArray(plan.featureEntitlements)&&plan.featureEntitlements.includes(featureKey);return {allowed,featureKey,reason:allowed?"ENTITLED":"FEATURE_NOT_INCLUDED",currentUsage};}
  async recordUsage(ctx:TenantContext,req:any){return this.put(ctx,"METER_EVENT",req.id||randomUUID(),{...req,id:req.id||randomUUID(),tenantId:ctx.tenantId,recordedAt:new Date().toISOString()});}
  async getUsageAggregate(ctx:TenantContext,meterType:string){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"METER_EVENT"}});const vals=rows.map((r:any)=>normalize(r.payload)).filter((x:any)=>x.meterType===meterType);return {meterType,totalUsage:vals.reduce((s:number,x:any)=>s+Number(x.quantity||0),0),events:vals.length};}
  async createInvoice(ctx:TenantContext,subscriptionId:string,couponCode?:string){const sub=await this.get(ctx,"SUBSCRIPTION",subscriptionId);if(!sub)throw new Error("Subscription not found");const id=randomUUID();const now=new Date().toISOString();return this.put(ctx,"BILLING_INVOICE",id,{id,tenantId:ctx.tenantId,subscriptionId,total:Number(sub.currentPeriodPrice||sub.basePrice||0),currency:sub.currency||"TZS",status:"OPEN",couponCode:couponCode||null,issuedAt:now,dueAt:now,createdAt:now,updatedAt:now});}
  async getInvoices(ctx:TenantContext){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"BILLING_INVOICE"},orderBy:{createdAt:"desc"}});return rows.map((r:any)=>normalize(r.payload));}
  async getInvoiceById(ctx:TenantContext,id:string){return this.get(ctx,"BILLING_INVOICE",id);}
  async processPayment(ctx:TenantContext,req:any){const id=req.id||randomUUID();return this.put(ctx,"BILLING_PAYMENT",id,{...req,id,tenantId:ctx.tenantId,status:"COMPLETED",processedAt:new Date().toISOString()});}
  async getPayments(ctx:TenantContext){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"BILLING_PAYMENT"},orderBy:{createdAt:"desc"}});return rows.map((r:any)=>normalize(r.payload));}
  async getSaaSKpis(){const rows=await db.saasDataRecord.findMany({where:{entityType:"SUBSCRIPTION"}});const active=rows.filter((r:any)=>["ACTIVE","TRIAL"].includes(r.status)).length;return {activeSubscriptions:active,totalSubscriptions:rows.length};}
}
