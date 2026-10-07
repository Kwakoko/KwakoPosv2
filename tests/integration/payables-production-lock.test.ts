import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { WorldStandardPrismaSyncEngine } from "@kwakopos2/sync";
import { PrismaFinanceRepository, PrismaProductRepository, PrismaStockRepository, prisma } from "@kwakopos2/database";

const root = path.resolve(__dirname, "../..");
const enabled = Boolean(process.env.DATABASE_URL);

describe("Payables Production Lock", () => {
  it("has the production AP repository, API, sync lock, and audit contract", () => {
    const finance = fs.readFileSync(path.join(root, "packages/database/src/prismaFinanceRepository.ts"), "utf8");
    const productionRepo = fs.readFileSync(path.join(root, "packages/database/src/prismaProductionRepositories.ts"), "utf8");
    const server = fs.readFileSync(path.join(root, "apps/api/src/server.ts"), "utf8");
    const sync = fs.readFileSync(path.join(root, "packages/sync/src/worldStandardPrismaSyncEngine.ts"), "utf8");
    const lock = fs.readFileSync(path.join(root, "packages/sync/src/payablesProductionLock.ts"), "utf8");

    for (const method of ["createSupplierInvoice", "getPayablesAging", "getSupplierStatement", "getPayablesLedger", "allocatePayment"]) {
      expect(finance).toContain(`async ${method}`);
    }
    expect(server).toContain("/api/v1/finance/payables/invoices");
    expect(server).toContain("/api/v1/finance/payables/aging");
    expect(server).toContain("/api/v1/finance/payables/statements/:supplierId");
    expect(server).toContain("/api/v1/finance/payables/ledger");
    expect(server).toContain("/api/v1/finance/payables/reports");
    expect(server).toContain("/api/v1/finance/payables/settle-supplier");
    expect(server).toContain("/api/v1/finance/payments/allocate");
    expect(sync).toContain("applyPayablesProductionLockOperation");
    expect(lock).toContain('op.entityType === "SupplierInvoice"');
    expect(lock).toContain('op.entityType === "Payment"');
    expect(lock).toContain('op.entityType === "PaymentAllocation"');
    expect(finance).toContain('action: "AP_INVOICE_CREATED"');
    expect(finance).toContain('"AP_PAYMENT_ALLOCATED"');
    expect(productionRepo).toContain('action: "AP_PAYMENT_CREATED"');
    expect(productionRepo).toContain('action: "AP_PAYMENT_ALLOCATED"');
  });

  it("converges AP invoice, supplier payment, partial allocation, aging, statement, ledger, and replay idempotency in PostgreSQL", async () => {
    if (!enabled) return;

    const tenantId = randomUUID();
    const branchId = randomUUID();
    const supplierId = randomUUID();
    const invoiceId = randomUUID();
    const paymentId = randomUUID();
    const allocationId = randomUUID();
    const now = new Date();
    const dueDate = new Date(now.getTime() - 45 * 86400000).toISOString();
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
          clientCreatedAt: now.toISOString(),
          idempotencyKey: `${deviceId}/${entityId}`,
        }],
      } as any);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "AP Production Lock Tenant",
        slug: `ap-lock-${tenantId.slice(0, 8)}`,
        branches: { create: { id: branchId, name: "Main", code: `AP-${branchId.slice(0, 6)}` } },
      },
    });

    try {
      const supplierResult = await push("ap-client", "Supplier", supplierId, {
        supplierCode: "AP-LOCK-001",
        name: "AP Lock Supplier",
        phone: "+255700000002",
        email: "ap-lock@example.test",
        address: "AP Smoke Branch",
        outstandingBalance: 0,
        status: "ACTIVE",
      });
      expect(supplierResult.results[0].status).toBe("SUCCESS");

      const invoiceResult = await push("ap-client", "SupplierInvoice", invoiceId, {
        supplierId,
        invoiceNumber: "BIL-AP-LOCK-001",
        dueDate,
        items: [{ description: "AP Lock Goods", quantity: 1, unitCost: 500000, taxRate: 0 }],
        notes: "Production lock integration test",
      });
      expect(invoiceResult.results[0].status).toBe("SUCCESS");

      const paymentResult = await push("ap-client", "Payment", paymentId, {
        supplierId,
        amount: 200000,
        paymentMethod: "BANK",
        provider: "NMB",
        providerReference: "AP-LOCK-REF",
      });
      expect(paymentResult.results[0].status).toBe("SUCCESS");

      const afterPayment = await prisma.supplier.findUnique({ where: { id: supplierId } });
      expect(Number(afterPayment?.outstandingBalance)).toBe(500000);

      const allocationResult = await push("ap-client", "PaymentAllocation", allocationId, {
        paymentId,
        supplierInvoiceId: invoiceId,
        allocatedAmount: 200000,
      });
      expect(allocationResult.results[0].status).toBe("SUCCESS");

      const invoice = await prisma.supplierInvoice.findUnique({ where: { id: invoiceId }, include: { allocations: true } });
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      const allocation = await prisma.paymentAllocation.findUnique({ where: { id: allocationId } });

      expect(Number(invoice?.balanceDue)).toBe(300000);
      expect(invoice?.status).toBe("PARTIALLY_PAID");
      expect(invoice?.allocations.length).toBe(1);
      expect(Number(supplier?.outstandingBalance)).toBe(300000);
      expect(Number(allocation?.allocatedAmount)).toBe(200000);

      const finance = new PrismaFinanceRepository();
      const aging = await finance.getPayablesAging(ctx, now);
      expect(Number(aging.totalOutstanding)).toBe(300000);
      expect(Number(aging.summary.days31To60)).toBe(300000);

      const statementEnd = new Date(Date.now() + 60_000);
      const statement = await finance.getSupplierStatement(
        ctx,
        supplierId,
        new Date(now.getTime() - 90 * 86400000).toISOString(),
        statementEnd.toISOString(),
      );
      expect(Number(statement.closingBalance)).toBe(300000);
      expect(Number(statement.totalPayments)).toBe(200000);
      expect(Number(statement.totalAllocated)).toBe(200000);
      expect(Number(statement.unappliedPayments)).toBe(0);

      const ledger = await finance.getPayablesLedger(ctx, supplierId);
      expect(ledger.reconciles).toBe(true);
      expect(Number(ledger.totalInvoiced)).toBe(500000);
      expect(Number(ledger.totalAllocated)).toBe(200000);
      expect(Number(ledger.totalOutstanding)).toBe(300000);

      const invoiceAudit = await prisma.auditEvent.findFirst({
        where: { tenantId, branchId, action: "AP_INVOICE_SYNCED", entityId: invoiceId },
      });
      const paymentAudit = await prisma.auditEvent.findFirst({
        where: { tenantId, branchId, action: "AP_PAYMENT_SYNCED", entityId: paymentId },
      });
      const allocationAudit = await prisma.auditEvent.findFirst({
        where: { tenantId, branchId, action: "AP_PAYMENT_ALLOCATION_SYNCED", entityId: invoiceId },
      });
      expect(invoiceAudit).toBeTruthy();
      expect(paymentAudit).toBeTruthy();
      expect(allocationAudit).toBeTruthy();

      const replay = await engine.processPush(ctx, {
        deviceId: "ap-client",
        operations: [{
          operationId: randomUUID(),
          entityType: "PaymentAllocation",
          entityId: allocationId,
          operationType: "CREATE",
          payload: { paymentId, supplierInvoiceId: invoiceId, allocatedAmount: 200000 },
          clientCreatedAt: now.toISOString(),
          idempotencyKey: "ap-client/replay-allocation",
        }],
      } as any);
      expect(["SUCCESS", "ALREADY_PROCESSED"]).toContain(replay.results[0].status);

      const replayedInvoice = await prisma.supplierInvoice.findUnique({ where: { id: invoiceId }, include: { allocations: true } });
      const replayedSupplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      expect(Number(replayedInvoice?.balanceDue)).toBe(300000);
      expect(replayedInvoice?.allocations.length).toBe(1);
      expect(Number(replayedSupplier?.outstandingBalance)).toBe(300000);
    } finally {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});
