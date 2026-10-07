import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../apps/api/src/server.js";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { WorldStandardPrismaSyncEngine } from "../../packages/sync/src/worldStandardPrismaSyncEngine.js";

const enabled = Boolean(process.env.DATABASE_URL);

describe("Customers / Contacts Production Lock closed loop", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  let server: ReturnType<typeof buildServer>;

  const headers = {
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
    "x-user-id": userId,
  };

  beforeAll(async () => {
    if (!enabled) return;
    await prisma.tenant.create({
      data: { id: tenantId, name: "Customers Contacts Lock Test", slug: "cust-contact-lock-" + tenantId.slice(0, 8) },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: "CCL-" + branchId.slice(0, 6), isMain: true },
    });
    server = buildServer({ productionPersistence: true });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (enabled) {
      await prisma.customer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.supplier.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
  });

  it("customer CRUD is tenant-scoped and audited", async () => {
    if (!enabled) return;
    const create = await server.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers,
      payload: {
        id: customerId,
        customerCode: "CCL-001",
        name: "Closed Loop Customer",
        phone: "+255700000001",
        email: "customer@example.test",
        openingBalance: 1000,
        creditLimit: 5000,
      },
    });
    expect(create.statusCode).toBe(201);

    const update = await server.inject({
      method: "PUT",
      url: "/api/v1/customers/" + customerId,
      headers,
      payload: { name: "Closed Loop Customer Updated", creditLimit: 7000 },
    });
    expect(update.statusCode).toBe(200);

    const audit = await prisma.auditEvent.findMany({
      where: { tenantId, branchId, entityType: "Customer", entityId: customerId },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.some((row) => row.action === "CUSTOMER_CREATED")).toBe(true);
    expect(audit.some((row) => row.action === "CUSTOMER_UPDATED")).toBe(true);
  });

  it("contact CRUD, search and history are authoritative and scoped", async () => {
    if (!enabled) return;
    const contactId = randomUUID();

    const create = await server.inject({
      method: "POST",
      url: "/api/v1/customers/" + customerId + "/contacts",
      headers,
      payload: {
        id: contactId,
        firstName: "Jane",
        lastName: "Doe",
        role: "Procurement Manager",
        department: "Purchasing",
        phone: "+255700000002",
        email: "jane@example.test",
        isPrimary: true,
        decisionInfluence: "DECISION_MAKER",
      },
    });
    expect(create.statusCode).toBe(201);

    const update = await server.inject({
      method: "PUT",
      url: "/api/v1/customers/" + customerId + "/contacts/" + contactId,
      headers,
      payload: { role: "Head of Procurement" },
    });
    expect(update.statusCode).toBe(200);

    const search = await server.inject({
      method: "GET",
      url: "/api/v1/contacts/search?q=procurement",
      headers,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().data.some((row: any) => row.id === contactId)).toBe(true);

    const history = await server.inject({
      method: "GET",
      url: "/api/v1/customers/" + customerId + "/history",
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data.contactAudits.some((row: any) => row.entityId === contactId)).toBe(true);

    const scoped = await prisma.$queryRawUnsafe<any[]>(
      'SELECT id,"customerId","tenantId","branchId","role" FROM customer_contacts WHERE id=$1',
      contactId,
    );
    expect(scoped[0].tenantId).toBe(tenantId);
    expect(scoped[0].branchId).toBe(branchId);
    expect(scoped[0].role).toBe("Head of Procurement");
  });

  it("customer payment is atomic and idempotent", async () => {
    if (!enabled) return;
    const key = "PAY-LOCK-" + randomUUID();
    const first = await server.inject({
      method: "POST",
      url: "/api/v1/customers/" + customerId + "/payment",
      headers,
      payload: { amount: 200, paymentMethod: "BANK", idempotencyKey: key },
    });
    expect(first.statusCode).toBe(200);

    const second = await server.inject({
      method: "POST",
      url: "/api/v1/customers/" + customerId + "/payment",
      headers,
      payload: { amount: 200, paymentMethod: "BANK", idempotencyKey: key },
    });
    expect(second.statusCode).toBe(200);

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(Number(customer?.currentBalance)).toBe(800);

    const payments = await prisma.payment.findMany({ where: { tenantId, branchId, customerId } });
    expect(payments).toHaveLength(1);
  });

  it("offline CustomerContact sync converges and audits", async () => {
    if (!enabled) return;
    const sync = new WorldStandardPrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const syncContactId = randomUUID();
    const operationId = randomUUID();
    const pushed = await sync.processPush({ tenantId, branchId, userId, roles: ["ADMIN"], permissions: ["*"] } as any, {
      deviceId: "CCL-SYNC-1",
      operations: [{
        operationId,
        entityType: "CustomerContact",
        entityId: syncContactId,
        operationType: "CREATE",
        payload: {
          id: syncContactId,
          customerId,
          firstName: "Sync",
          lastName: "Contact",
          role: "Finance",
          phone: "+255700000003",
          email: "sync@example.test",
          isPrimary: false,
          decisionInfluence: "INFLUENCER",
          notes: "offline",
        },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "CCL-SYNC:" + operationId,
      }],
    } as any);
    expect(pushed.results[0].status).toBe("SUCCESS");

    const row = await prisma.$queryRawUnsafe<any[]>(
      'SELECT id,"customerId","tenantId","branchId","status" FROM customer_contacts WHERE id=$1',
      syncContactId,
    );
    expect(row[0]?.customerId).toBe(customerId);
    expect(row[0]?.tenantId).toBe(tenantId);
    expect(row[0]?.branchId).toBe(branchId);
    expect(row[0]?.status).toBe("ACTIVE");

    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId, branchId, entityType: "CustomerContact", entityId: syncContactId, action: "CONTACT_CREATED" },
    });
    expect(audit).toBeTruthy();

    const delta = await sync.processDelta({ tenantId, branchId, userId, roles: ["ADMIN"], permissions: ["*"] } as any, { since: "rev:0" } as any);
    expect((delta as any).changes?.some((change: any) => change.entityId === syncContactId)).toBe(true);
  });

  it("customer archive remains blocked while balance is outstanding", async () => {
    if (!enabled) return;
    const denied = await server.inject({
      method: "DELETE",
      url: "/api/v1/customers/" + customerId,
      headers,
    });
    expect(denied.statusCode).toBe(400);
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.status).toBe("ACTIVE");
  });
});
