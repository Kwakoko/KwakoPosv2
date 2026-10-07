import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

type Ctx = { tenantId: string; branchId: string; userId: string; roles?: string[]; permissions?: string[] };

function ctx(req: FastifyRequest): Ctx {
  const value = (req as any).tenantContext;
  if (!value?.tenantId || !value?.branchId || !value?.userId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
  return value;
}

function hasPermission(req: FastifyRequest, ...required: string[]): boolean {
  const c = ctx(req);
  const permissions = new Set((c.permissions || []).map((p) => String(p).trim().toLowerCase()));
  const roles = (c.roles || []).map((r) => String(r).trim().toUpperCase());
  return permissions.has("*") || permissions.has("admin:*") ||
    roles.some((r) => ["OWNER", "ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(r)) ||
    required.some((p) => permissions.has(p.toLowerCase()));
}

function requirePermission(req: FastifyRequest, ...required: string[]): void {
  if (!hasPermission(req, ...required)) throw new Error("FORBIDDEN: " + required.join(" or ") + " permission required");
}

const ContactCreateSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().optional().default(""),
  title: z.string().trim().optional().default(""),
  role: z.string().trim().optional().default(""),
  department: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().optional().default(""),
  decisionInfluence: z.enum(["DECISION_MAKER","INFLUENCER","USER","CHAMPION","BLOCKER"]).optional().default("INFLUENCER"),
});

const ContactUpdateSchema = ContactCreateSchema.omit({ customerId: true, id: true }).partial();

const CustomerPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["CASH", "BANK", "MOBILE_MONEY", "CARD", "OTHER"]).default("BANK"),
  provider: z.string().trim().optional(),
  providerReference: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  cashSessionId: z.string().uuid().optional(),
});

const ImportSchema = z.object({
  records: z.array(z.object({
    id: z.string().uuid().optional(),
    customerCode: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    phone: z.string().trim().optional().default(""),
    email: z.string().email().optional().or(z.literal("")).default(""),
    address: z.string().trim().optional().default(""),
    creditLimit: z.number().nonnegative().optional().default(0),
    openingBalance: z.number().default(0),
  })).min(1).max(5000),
});

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function audit(db: any, c: Ctx, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await db.auditEvent.create({
    data: {
      id: randomUUID(),
      tenantId: c.tenantId,
      branchId: c.branchId,
      userId: c.userId,
      deviceId: "customer-contacts-api",
      action,
      entityType,
      entityId,
      metadata,
    },
  });
}

export async function customerContactRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/customers/:id/history", async (req) => {
    requirePermission(req, "CUSTOMER_VIEW", "customers.read");
    const c = ctx(req);
    const customerId = String((req.params as any).id);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: c.tenantId, branchId: c.branchId } });
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const [sales, payments, returns, audits, contactAudits] = await Promise.all([
      prisma.sale.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, customerId }, orderBy: { soldAt: "desc" }, take: 200, select: { id: true, saleNumber: true, grandTotal: true, paymentStatus: true, status: true, soldAt: true } }),
      prisma.payment.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, customerId }, orderBy: { paidAt: "desc" }, take: 200, select: { id: true, paymentNumber: true, amount: true, paymentMethod: true, provider: true, providerReference: true, status: true, paidAt: true } }),
      prisma.return.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, customerId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, returnNumber: true, refundType: true, reason: true, createdAt: true } }),
      prisma.auditEvent.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, entityType: "Customer", entityId: customerId }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.auditEvent.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, entityType: "CustomerContact" }, orderBy: { createdAt: "desc" }, take: 500 }).then((rows: any[]) => rows.filter((row) => String((row.metadata as any)?.customerId || "") === customerId).slice(0, 200)).catch(() => []),
    ]);
    return { success: true, data: { customer, sales, payments, returns, audits, contactAudits } };
  });

  server.get("/api/v1/customers/:id/contacts", async (req) => {
    requirePermission(req, "CUSTOMER_VIEW", "customers.read");
    const c = ctx(req);
    const customerId = String((req.params as any).id);
    const rows = await prisma.$queryRawUnsafe<any[]>(
      'SELECT id,"customerId","tenantId","branchId","firstName","lastName","title",role,department,"phone","email","isPrimary","notes","decisionInfluence","status","createdAt","updatedAt" FROM customer_contacts WHERE id IS NOT NULL AND "customerId" = $1 AND "tenantId" = $2 AND "branchId" = $3 ORDER BY "isPrimary" DESC,"firstName" ASC,"lastName" ASC',
      customerId, c.tenantId, c.branchId
    );
    return { success: true, data: rows };
  });

  server.get("/api/v1/contacts/search", async (req) => {
    requirePermission(req, "CUSTOMER_VIEW", "customers.read");
    const c = ctx(req);
    const q = String((req.query as any)?.q || "").trim().toLowerCase();
    if (q.length < 2) return { success: true, data: [] };
    const like = "%" + q + "%";
    const rows = await prisma.$queryRawUnsafe<any[]>(
      'SELECT cc.id,cc."customerId",cc."firstName",cc."lastName",cc.title,cc.role,cc.department,cc.phone,cc.email,cc."isPrimary",cc."decisionInfluence",c.name AS "customerName" FROM customer_contacts cc JOIN customers c ON c.id=cc."customerId" AND c."tenantId"=$1 AND c."branchId"=$2 WHERE cc."tenantId"=$1 AND cc."branchId"=$2 AND (LOWER(cc."firstName") LIKE $3 OR LOWER(cc."lastName") LIKE $3 OR LOWER(cc.phone) LIKE $3 OR LOWER(cc.email) LIKE $3 OR LOWER(cc.title) LIKE $3 OR LOWER(c.name) LIKE $3) ORDER BY cc."isPrimary" DESC,cc."firstName" ASC LIMIT 100',
      c.tenantId, c.branchId, like
    );
    return { success: true, data: rows };
  });

  server.post("/api/v1/customers/:id/contacts", async (req, reply) => {
    requirePermission(req, "CUSTOMER_EDIT", "customers.write");
    const c = ctx(req);
    const customerId = String((req.params as any).id);
    const payload = ContactCreateSchema.parse({ ...(req.body as any), customerId });
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: c.tenantId, branchId: c.branchId, status: "ACTIVE" } });
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const id = payload.id || randomUUID();
    await prisma.$transaction(async (tx: any) => {
      if (payload.isPrimary) await tx.$executeRawUnsafe('UPDATE customer_contacts SET "isPrimary"=false WHERE "customerId"=$1 AND "tenantId"=$2 AND "branchId"=$3', customerId, c.tenantId, c.branchId);
      await tx.$executeRawUnsafe('INSERT INTO customer_contacts (id,"customerId","tenantId","branchId","firstName","lastName","title",role,department,"phone","email","isPrimary","notes","decisionInfluence","status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,\'ACTIVE\')',
        id, customerId, c.tenantId, c.branchId, payload.firstName, payload.lastName, payload.title, payload.role, payload.department, payload.phone, payload.email, payload.isPrimary, payload.notes, payload.decisionInfluence);
      await audit(tx, c, "CONTACT_CREATED", "CustomerContact", id, { customerId });
    });
    return reply.status(201).send({ success: true, data: { id, ...payload } });
  });

  server.put("/api/v1/customers/:id/contacts/:contactId", async (req) => {
    requirePermission(req, "CUSTOMER_EDIT", "customers.write");
    const c = ctx(req);
    const customerId = String((req.params as any).id);
    const contactId = String((req.params as any).contactId);
    const patch = ContactUpdateSchema.parse(req.body);
    const current = await prisma.$queryRawUnsafe<any[]>(
      'SELECT * FROM customer_contacts WHERE id=$1 AND "customerId"=$2 AND "tenantId"=$3 AND "branchId"=$4 LIMIT 1',
      contactId, customerId, c.tenantId, c.branchId
    );
    if (!current[0]) throw new Error("CONTACT_NOT_FOUND");
    await prisma.$transaction(async (tx: any) => {
      if (patch.isPrimary) await tx.$executeRawUnsafe('UPDATE customer_contacts SET "isPrimary"=false WHERE "customerId"=$1 AND "tenantId"=$2 AND "branchId"=$3', customerId, c.tenantId, c.branchId);
      const row = { ...current[0], ...patch };
      await tx.$executeRawUnsafe('UPDATE customer_contacts SET "firstName"=$1,"lastName"=$2,"title"=$3,role=$4,department=$5,"phone"=$6,"email"=$7,"isPrimary"=$8,"notes"=$9,"decisionInfluence"=$10,"status"=$11,"updatedAt"=now() WHERE id=$12 AND "customerId"=$13 AND "tenantId"=$14 AND "branchId"=$15',
        row.firstName, row.lastName || "", row.title || "", row.role || "", row.department || "", row.phone || "", row.email || "", Boolean(row.isPrimary), row.notes || "", row.decisionInfluence || "INFLUENCER", row.status || "ACTIVE", contactId, customerId, c.tenantId, c.branchId);
      await audit(tx, c, "CONTACT_UPDATED", "CustomerContact", contactId, { customerId, changedFields: Object.keys(patch).sort() });
    });
    return { success: true, data: { ...current[0], ...patch } };
  });

  server.delete("/api/v1/customers/:id/contacts/:contactId", async (req) => {
    requirePermission(req, "CUSTOMER_EDIT", "customers.write");
    const c = ctx(req);
    const customerId = String((req.params as any).id);
    const contactId = String((req.params as any).contactId);
    const result = await prisma.$transaction(async (tx: any) => {
      const rows = await tx.$queryRawUnsafe('SELECT id,"isPrimary" FROM customer_contacts WHERE id=$1 AND "customerId"=$2 AND "tenantId"=$3 AND "branchId"=$4 LIMIT 1', contactId, customerId, c.tenantId, c.branchId);
      if (!rows[0]) throw new Error("CONTACT_NOT_FOUND");
      await tx.$executeRawUnsafe('UPDATE customer_contacts SET "status"=\'INACTIVE\',"updatedAt"=now() WHERE id=$1 AND "customerId"=$2 AND "tenantId"=$3 AND "branchId"=$4', contactId, customerId, c.tenantId, c.branchId);
      await audit(tx, c, "CONTACT_ARCHIVED", "CustomerContact", contactId, { customerId, wasPrimary: Boolean(rows[0].isPrimary) });
      return { archived: true };
    });
    return { success: true, data: result };
  });

  server.post("/api/v1/customers/:id/payment", async (req) => {
    requirePermission(req, "CUSTOMER_EDIT", "AR_MANAGE", "customers.write");
    const c = ctx(req);
    const customerId = String((req.params as any).id);
    const payload = CustomerPaymentSchema.parse(req.body);
    if (payload.paymentMethod === "CASH" && !payload.cashSessionId) throw new Error("CASH_SESSION_REQUIRED");
    const payment = await prisma.$transaction(async (tx: any) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId: c.tenantId, branchId: c.branchId, status: "ACTIVE" } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      if (payload.idempotencyKey) {
        const prior = await tx.payment.findFirst({
          where: {
            tenantId: c.tenantId,
            branchId: c.branchId,
            customerId,
            paymentNumber: "PAY-CUST-" + payload.idempotencyKey.replace(/[^A-Za-z0-9]/g, "").slice(0, 24).toUpperCase(),
          },
        });
        if (prior) return prior;
      }
      const balance = Number(customer.currentBalance);
      if (payload.amount > balance + 0.005) throw new Error("PAYMENT_EXCEEDS_CUSTOMER_BALANCE");
      if (payload.paymentMethod === "CASH") {
        const session = await tx.cashSession.findFirst({ where: { id: payload.cashSessionId, tenantId: c.tenantId, branchId: c.branchId, cashierId: c.userId, status: "OPEN" } });
        if (!session) throw new Error("CASH_SESSION_INVALID");
      }
      const paymentId = randomUUID();
      const paymentNumber = payload.idempotencyKey
        ? "PAY-CUST-" + payload.idempotencyKey.replace(/[^A-Za-z0-9]/g, "").slice(0, 24).toUpperCase()
        : "PAY-CUST-" + randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase();
      const created = await tx.payment.create({ data: { id: paymentId, tenantId: c.tenantId, branchId: c.branchId, paymentNumber, customerId, amount: payload.amount, paymentMethod: payload.paymentMethod, provider: payload.provider || null, providerReference: payload.providerReference || null, status: "COMPLETED", paidAt: new Date() } });
      await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: payload.amount } } });
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, deviceId: "customer-contacts-api", action: "CUSTOMER_PAYMENT_POSTED", entityType: "Customer", entityId: customer.id, metadata: { paymentId: created.id, amount: payload.amount, paymentMethod: payload.paymentMethod, provider: payload.provider || null, providerReference: payload.providerReference || null } } });
      return created;
    });
    return { success: true, data: payment };
  });

  server.get("/api/v1/suppliers/:id/history", async (req) => {
    requirePermission(req, "SUPPLIER_VIEW", "suppliers.read");
    const c = ctx(req);
    const supplierId = String((req.params as any).id);
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: c.tenantId, branchId: c.branchId } });
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    const [purchaseOrders, purchaseReceipts, payments, audits] = await Promise.all([
      prisma.purchaseOrder.findMany({ where: { supplierId, tenantId: c.tenantId, branchId: c.branchId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, orderNumber: true, status: true, totalAmount: true, orderedAt: true } }),
      prisma.purchaseReceipt.findMany({ where: { supplierId, tenantId: c.tenantId, branchId: c.branchId }, orderBy: { receivedAt: "desc" }, take: 200, select: { id: true, receiptNumber: true, receivedAt: true } }),
      prisma.payment.findMany({ where: { supplierId, tenantId: c.tenantId, branchId: c.branchId }, orderBy: { paidAt: "desc" }, take: 200, select: { id: true, paymentNumber: true, amount: true, paymentMethod: true, provider: true, providerReference: true, status: true, paidAt: true } }),
      prisma.auditEvent.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId, entityType: "Supplier", entityId: supplierId }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    return { success: true, data: { supplier, purchaseOrders, purchaseReceipts, payments, audits } };
  });

  server.get("/api/v1/customers/export.csv", async (req, reply) => {
    requirePermission(req, "CUSTOMER_VIEW", "customers.read", "REPORT_EXPORT");
    const c = ctx(req);
    const rows = await prisma.customer.findMany({ where: { tenantId: c.tenantId, branchId: c.branchId }, orderBy: { customerCode: "asc" } });
    await audit(prisma, c, "CUSTOMER_EXPORT", "CustomerDirectory", c.tenantId + ":" + c.branchId, { rowCount: rows.length });
    const header = ["customerCode","name","phone","email","address","creditLimit","currentBalance","status"];
    const csv = [header.join(","), ...rows.map((r: any) => [r.customerCode,r.name,r.phone,r.email,r.address,r.creditLimit,r.currentBalance,r.status].map(csvCell).join(","))].join("\n") + "\n";
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="customers.csv"');
    return reply.send(csv);
  });

  server.post("/api/v1/customers/import", async (req) => {
    requirePermission(req, "CUSTOMER_CREATE", "customers.write");
    const c = ctx(req);
    const parsed = ImportSchema.parse(req.body);
    const results: any[] = [];
    await prisma.$transaction(async (tx: any) => {
      for (const item of parsed.records) {
        const existing = item.customerCode ? await tx.customer.findFirst({ where: { tenantId: c.tenantId, branchId: c.branchId, customerCode: item.customerCode } }) : null;
        if (existing) {
          await tx.customer.update({ where: { id: existing.id }, data: { name: item.name, phone: item.phone || null, email: item.email || null, address: item.address || null, creditLimit: item.creditLimit } });
          await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, deviceId: "customer-contacts-api", action: "CUSTOMER_IMPORTED_UPDATED", entityType: "Customer", entityId: existing.id, metadata: { customerCode: existing.customerCode } } });
          results.push({ id: existing.id, action: "UPDATED" });
        } else {
          const id = item.id || randomUUID();
          const count = await tx.customer.count({ where: { tenantId: c.tenantId, branchId: c.branchId } });
          const customerCode = item.customerCode || `CUST-${String(count + results.length + 1).padStart(4,"0")}`;
          await tx.customer.create({ data: { id, tenantId: c.tenantId, branchId: c.branchId, customerCode, name: item.name, phone: item.phone || null, email: item.email || null, address: item.address || null, creditLimit: item.creditLimit, currentBalance: item.openingBalance, openingBalance: item.openingBalance, status: "ACTIVE" } });
          await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, deviceId: "customer-contacts-api", action: "CUSTOMER_IMPORTED_CREATED", entityType: "Customer", entityId: id, metadata: { customerCode } } });
          results.push({ id, action: "CREATED" });
        }
      }
    });
    return { success: true, data: { imported: results.length, results } };
  });
}
