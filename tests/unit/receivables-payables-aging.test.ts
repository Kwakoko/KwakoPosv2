import { describe, it, expect } from "vitest";
import { ReceivablesPayablesEngine } from "../../packages/domain/src/index.js";
import type { CustomerInvoice, SupplierInvoice, TenantContext } from "@kwakopos2/contracts";

describe("KwakoPos Receivables & Payables Aging & Allocation Tests", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  const asOf = new Date("2026-08-26T00:00:00.000Z");

  it("categorizes outstanding invoices into standard aging buckets", () => {
    const invoices = [
      { dueDate: "2026-08-28T00:00:00.000Z", balanceDue: 10000 }, // Current (not due yet)
      { dueDate: "2026-08-16T00:00:00.000Z", balanceDue: 20000 }, // 10 days overdue -> 1-30
      { dueDate: "2026-07-15T00:00:00.000Z", balanceDue: 30000 }, // 42 days overdue -> 31-60
      { dueDate: "2026-06-15T00:00:00.000Z", balanceDue: 40000 }, // 72 days overdue -> 61-90
      { dueDate: "2026-04-01T00:00:00.000Z", balanceDue: 50000 }, // 147 days overdue -> 90+
    ];

    const buckets = ReceivablesPayablesEngine.categorizeAgingBuckets(invoices, asOf);

    expect(buckets.current).toBe(10000);
    expect(buckets.days1To30).toBe(20000);
    expect(buckets.days31To60).toBe(30000);
    expect(buckets.days61To90).toBe(40000);
    expect(buckets.days90Plus).toBe(50000);
    expect(buckets.total).toBe(150000);
  });

  it("generates full AR Aging Report with customer breakdown", () => {
    const customers = [
      { id: "cust-1", name: "Alpha Traders", customerCode: "CUST-001" },
      { id: "cust-2", name: "Beta Stores", customerCode: "CUST-002" },
    ];

    const invoices: CustomerInvoice[] = [
      {
        id: "inv-1",
        tenantId: dummyCtx.tenantId,
        branchId: dummyCtx.branchId,
        customerId: "cust-1",
        invoiceNumber: "INV-001",
        invoiceDate: "2026-07-01",
        dueDate: "2026-08-01", // ~25 days overdue
        subtotal: 100000,
        taxTotal: 0,
        discountTotal: 0,
        grandTotal: 100000,
        amountPaid: 0,
        balanceDue: 100000,
        status: "ISSUED",
        createdAt: "2026-07-01",
        updatedAt: "2026-07-01",
      },
    ];

    const report = ReceivablesPayablesEngine.generateReceivablesAgingReport(dummyCtx, customers, invoices, asOf);

    expect(report.reportType).toBe("ACCOUNTS_RECEIVABLE");
    expect(report.totalOutstanding).toBe(100000);
    expect(report.items.length).toBe(1);
    expect(report.items[0].entityName).toBe("Alpha Traders");
    expect(report.items[0].buckets.days1To30).toBe(100000);
  });

  it("allocates partial and full payment against invoice", () => {
    const invoice: CustomerInvoice = {
      id: "inv-alloc",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      customerId: "cust-1",
      invoiceNumber: "INV-ALLOC-001",
      invoiceDate: "2026-08-01",
      dueDate: "2026-08-15",
      subtotal: 100000,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 100000,
      amountPaid: 0,
      balanceDue: 100000,
      status: "ISSUED",
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    };

    // Partial allocation: 40k
    const partial = ReceivablesPayablesEngine.allocatePayment(dummyCtx, {
      paymentId: "pay-1",
      invoice,
      amountToAllocate: 40000,
    });
    expect(partial.updatedInvoice.amountPaid).toBe(40000);
    expect(partial.updatedInvoice.balanceDue).toBe(60000);
    expect(partial.updatedInvoice.status).toBe("PARTIALLY_PAID");
    expect(partial.remainingUnallocated).toBe(0);

    // Full remaining allocation: 60k
    const full = ReceivablesPayablesEngine.allocatePayment(dummyCtx, {
      paymentId: "pay-2",
      invoice: partial.updatedInvoice,
      amountToAllocate: 70000, // 10k excess
    });
    expect(full.updatedInvoice.amountPaid).toBe(100000);
    expect(full.updatedInvoice.balanceDue).toBe(0);
    expect(full.updatedInvoice.status).toBe("PAID");
    expect(full.remainingUnallocated).toBe(10000);
  });
});
