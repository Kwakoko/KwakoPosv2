import { describe, it, expect } from "vitest";
import { FinancialBridge, AccountLookup } from "../../packages/domain/src/index.js";
import type { Sale, PurchaseReceipt, Payment, Expense, Return, CashSession, TenantContext } from "@kwakopos2/contracts";

describe("KwakoPos Financial Bridge Commercial Mapper Tests", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  const accounts: AccountLookup = {
    cashAccountId: "acc-1110-cash",
    bankAccountId: "acc-1210-bank",
    receivableAccountId: "acc-1310-ar",
    inventoryAccountId: "acc-1410-inv",
    payableAccountId: "acc-2110-ap",
    taxPayableAccountId: "acc-2210-vat",
    salesRevenueAccountId: "acc-4100-rev",
    salesDiscountAccountId: "acc-4900-disc",
    cogsAccountId: "acc-5100-cogs",
    expenseDefaultAccountId: "acc-6900-exp",
    cashVarianceAccountId: "acc-8100-var",
  };

  it("maps POS Cash Sale with VAT and COGS into balanced GL Journal", () => {
    const sale: Sale = {
      id: "sale-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      saleNumber: "SAL-MAIN-2026-0001",
      customerId: null,
      cashSessionId: null,
      subtotal: 100000,
      discountTotal: 0,
      taxTotal: 18000,
      grandTotal: 118000,
      totalCost: 60000,
      grossProfit: 40000,
      status: "COMPLETED",
      paymentStatus: "PAID",
      deviceId: "dev-1",
      operationId: "op-1",
      idempotencyKey: "idem-sale-1",
      soldById: dummyCtx.userId,
      soldAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapSaleToJournal(dummyCtx, sale, accounts, "CASH");

    expect(journal.totalDebit).toBe(118000 + 60000); // Tender 118k + COGS 60k
    expect(journal.totalCredit).toBe(118000 + 60000); // Revenue 100k + VAT 18k + Inventory 60k
    expect(journal.status).toBe("POSTED");

    // Check line accounts
    const cashLine = lines.find((l) => l.accountId === accounts.cashAccountId)!;
    expect(cashLine.debit).toBe(118000);

    const revLine = lines.find((l) => l.accountId === accounts.salesRevenueAccountId)!;
    expect(revLine.credit).toBe(100000);

    const vatLine = lines.find((l) => l.accountId === accounts.taxPayableAccountId)!;
    expect(vatLine.credit).toBe(18000);

    const cogsLine = lines.find((l) => l.accountId === accounts.cogsAccountId)!;
    expect(cogsLine.debit).toBe(60000);

    const invLine = lines.find((l) => l.accountId === accounts.inventoryAccountId)!;
    expect(invLine.credit).toBe(60000);
  });

  it("maps Credit Sale to Accounts Receivable debit", () => {
    const sale: Sale = {
      id: "sale-credit",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      saleNumber: "SAL-MAIN-2026-0002",
      customerId: "cust-1",
      cashSessionId: null,
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 50000,
      totalCost: 30000,
      grossProfit: 20000,
      status: "COMPLETED",
      paymentStatus: "UNPAID",
      deviceId: "dev-1",
      operationId: "op-2",
      idempotencyKey: "idem-sale-2",
      soldById: dummyCtx.userId,
      soldAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapSaleToJournal(dummyCtx, sale, accounts, "CREDIT");
    const arLine = lines.find((l) => l.accountId === accounts.receivableAccountId)!;
    expect(arLine.debit).toBe(50000);
  });

  it("maps Goods Receipt into Inventory Asset and Accounts Payable", () => {
    const receipt: PurchaseReceipt = {
      id: "rec-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      receiptNumber: "REC-MAIN-2026-0001",
      purchaseOrderId: null,
      supplierId: "sup-1",
      receivedAt: new Date().toISOString(),
      createdById: dummyCtx.userId,
      notes: null,
      items: [
        { id: "i1", purchaseReceiptId: "rec-1", variantId: "v1", quantityReceived: 100, unitCost: 5000, totalCost: 500000, batchNumber: null, expiryDate: null },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapGoodsReceiptToJournal(dummyCtx, receipt, accounts);

    expect(journal.totalDebit).toBe(500000);
    expect(journal.totalCredit).toBe(500000);

    const invLine = lines.find((l) => l.accountId === accounts.inventoryAccountId)!;
    expect(invLine.debit).toBe(500000);

    const apLine = lines.find((l) => l.accountId === accounts.payableAccountId)!;
    expect(apLine.credit).toBe(500000);
  });

  it("maps Customer Payment to Cash debit and AR credit", () => {
    const payment: Payment = {
      id: "pay-cust-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      paymentNumber: "PAY-MAIN-2026-0001",
      saleId: null,
      purchaseReceiptId: null,
      customerId: "cust-1",
      supplierId: null,
      amount: 50000,
      paymentMethod: "CASH",
      provider: null,
      providerReference: null,
      status: "COMPLETED",
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapCustomerPaymentToJournal(dummyCtx, payment, accounts);

    expect(journal.totalDebit).toBe(50000);
    expect(journal.totalCredit).toBe(50000);

    expect(lines.find((l) => l.accountId === accounts.cashAccountId)!.debit).toBe(50000);
    expect(lines.find((l) => l.accountId === accounts.receivableAccountId)!.credit).toBe(50000);
  });

  it("maps Cash Session Drawer Shortage into Expense Discrepancy", () => {
    const session: CashSession = {
      id: "ses-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      sessionNumber: "SES-MAIN-2026-0001",
      cashierId: dummyCtx.userId,
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      openingCash: 100000,
      closingCash: 145000,
      expectedCash: 150000,
      actualCash: 145000,
      cashSalesTotal: 50000,
      cashRefundsTotal: 0,
      cashExpensesTotal: 0,
      variance: -5000, // Shortage
      status: "CLOSED",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = FinancialBridge.mapCashSessionVarianceToJournal(dummyCtx, session, accounts);
    expect(result).not.toBeNull();
    const { journal, lines } = result!;

    expect(journal.totalDebit).toBe(5000);
    expect(journal.totalCredit).toBe(5000);

    expect(lines.find((l) => l.accountId === accounts.cashVarianceAccountId)!.debit).toBe(5000);
    expect(lines.find((l) => l.accountId === accounts.cashAccountId)!.credit).toBe(5000);
  });
});
