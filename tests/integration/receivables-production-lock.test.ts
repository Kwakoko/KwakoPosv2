import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { WorldStandardPrismaSyncEngine } from "@kwakopos2/sync";
import { PrismaProductRepository, PrismaStockRepository, prisma } from "@kwakopos2/database";

const root = path.resolve(__dirname, "../..");
const enabled = Boolean(process.env.DATABASE_URL);

describe("Receivables Production Lock", () => {
  it("has the production AR repository, API, sync lock, and audit contract", () => {
    const finance = fs.readFileSync(path.join(root, "packages/database/src/prismaFinanceRepository.ts"), "utf8");
    const server = fs.readFileSync(path.join(root, "apps/api/src/server.ts"), "utf8");
    const sync = fs.readFileSync(path.join(root, "packages/sync/src/worldStandardPrismaSyncEngine.ts"), "utf8");
    const lock = fs.readFileSync(path.join(root, "packages/sync/src/receivablesProductionLock.ts"), "utf8");

    for (const method of ["getReceivablesAging", "allocatePayment", "getCustomerStatement", "getReceivablesLedger", "getReceivablesCollections"]) {
      expect(finance).toContain(`async ${method}`);
    }
    expect(server).toContain("/api/v1/finance/receivables/aging");
    expect(server).toContain("/api/v1/finance/receivables/statements/:customerId");
    expect(server).toContain("/api/v1/finance/receivables/ledger");
    expect(server).toContain("/api/v1/finance/receivables/collections");
    expect(server).toContain("/api/v1/finance/receivables/collections/actions");
    expect(server).toContain("/api/v1/finance/payments/allocate");
    expect(sync).toContain("applyReceivablesProductionLockOperation");
    expect(sync).toContain('case "CustomerInvoice"');
    expect(sync).toContain('case "PaymentAllocation"');
    expect(lock).toContain('op.entityType === "CustomerInvoice"');
    expect(lock).toContain('op.entityType === "PaymentAllocation"');
    expect(finance).toContain("AR_INVOICE_CREATED");
    expect(finance).toContain("AR_PAYMENT_ALLOCATED");
  });

  it("converges an offline AR invoice, customer payment, and payment allocation in PostgreSQL", async () => {
    if (!enabled) return;

    const tenantId = randomUUID();
    const branchId = randomUUID();
    const customerId = randomUUID();
    const invoiceId = randomUUID();
    const paymentId = randomUUID();
    const allocationId = randomUUID();
    const now = new Date().toISOString();
    const ctx: any = {
      tenantId,
      branchId,
      userId: randomUUID(),
      roles: ["MANAGER"],
      permissions: ["*"],
    };
    const engine = new WorldStandardPrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const push = (deviceId: string, entityType: string, entityId: string, payload: any, operationType = "CREATE") =>
      engine.processPush(ctx, {
        deviceId,
        operations: [{
          operationId: randomUUID(),
          entityType,
          entityId,
          operationType,
          payload,
          clientCreatedAt: now,
          idempotencyKey: `${deviceId}/${entityId}`,
        }],
      } as any);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "AR Production Lock Tenant",
        slug: `ar-lock-${tenantId.slice(0, 8)}`,
        branches: { create: { id: branchId, name: "Main", code: `AR-${branchId.slice(0, 6)}` } },
      },
    });

    try {
      const customerResult = await push("ar-client", "Customer", customerId, {
        customerCode: "AR-LOCK-001",
        name: "AR Lock Customer",
        phone: "+255700000001",
        email: "ar-lock@example.test",
        address: "AR Smoke Branch",
        creditLimit: 1000000,
        openingBalance: 500000,
        currentBalance: 500000,
        status: "ACTIVE",
      });
      expect(customerResult.results[0].status).toBe("SUCCESS");

      const invoiceResult = await push("ar-client", "CustomerInvoice", invoiceId, {
        customerId,
        dueDate: new Date(Date.now() - 45 * 86400000).toISOString(),
        items: [{ description: "AR Lock Goods", quantity: 1, unitPrice: 500000 }],
        notes: "Production lock integration test",
      });
      expect(invoiceResult.results[0].status).toBe("SUCCESS");

      const paymentResult = await push("ar-client", "Payment", paymentId, {
        customerId,
        amount: 200000,
        paymentMethod: "BANK",
        provider: "NMB",
        providerReference: "AR-LOCK-REF",
      });
      expect(paymentResult.results[0].status).toBe("SUCCESS");

      const allocationResult = await push("ar-client", "PaymentAllocation", allocationId, {
        paymentId,
        customerInvoiceId: invoiceId,
        allocatedAmount: 200000,
      });
      expect(allocationResult.results[0].status).toBe("SUCCESS");

      const invoice = await prisma.customerInvoice.findUnique({ where: { id: invoiceId }, include: { allocations: true } });
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      const allocation = await prisma.paymentAllocation.findUnique({ where: { id: allocationId } });

      expect(Number(invoice?.balanceDue)).toBe(300000);
      expect(invoice?.status).toBe("PARTIALLY_PAID");
      expect(invoice?.allocations.length).toBe(1);
      expect(Number(customer?.currentBalance)).toBe(300000);
      expect(Number(allocation?.allocatedAmount)).toBe(200000);

      const invoiceAudit = await prisma.auditEvent.findFirst({ where: { tenantId, branchId, action: "AR_INVOICE_SYNCED", entityId: invoiceId } });
      const allocationAudit = await prisma.auditEvent.findFirst({ where: { tenantId, branchId, action: "AR_PAYMENT_ALLOCATION_SYNCED", entityId: invoiceId } });
      expect(invoiceAudit).toBeTruthy();
      expect(allocationAudit).toBeTruthy();

      const journalRows = await prisma.$queryRawUnsafe<Array<{ entity_type: string }>>(
        `SELECT entity_type FROM sync_change_journal
           WHERE tenant_id = $1 AND branch_id = $2
             AND entity_id = ANY($3::text[])
           ORDER BY revision ASC`,
        tenantId,
        branchId,
        [invoiceId, allocationId],
      );
      expect(journalRows.some((row: any) => row.entity_type === "CustomerInvoice")).toBe(true);
      expect(journalRows.some((row: any) => row.entity_type === "PaymentAllocation")).toBe(true);

      const replay = await engine.processPush(ctx, {
        deviceId: "ar-client",
        operations: [{
          operationId: randomUUID(),
          entityType: "PaymentAllocation",
          entityId: allocationId,
          operationType: "CREATE",
          payload: { paymentId, customerInvoiceId: invoiceId, allocatedAmount: 200000 },
          clientCreatedAt: now,
          idempotencyKey: "ar-client/replay-allocation",
        }],
      } as any);
      expect(["SUCCESS", "ALREADY_PROCESSED"]).toContain(replay.results[0].status);
      const replayedInvoice = await prisma.customerInvoice.findUnique({ where: { id: invoiceId }, include: { allocations: true } });
      expect(Number(replayedInvoice?.balanceDue)).toBe(300000);
      expect(replayedInvoice?.allocations.length).toBe(1);
    } finally {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});
