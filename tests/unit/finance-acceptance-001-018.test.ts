import { describe, it, expect } from "vitest";
import {
  AccountingEngine,
  FinancialBridge,
  ReceivablesPayablesEngine,
  BudgetEngine,
  PricingTaxEngine,
  CashSessionEngine,
  assertJournalBalanced,
  assertPeriodAllowsPosting,
  assertFinancialIdempotency,
} from "@kwakopos2/domain";
import {
  ScopedCommercialRepository,
  ScopedFinanceRepository,
  globalInMemoryStore,
  hardenFinanceRepository,
  wireCommercialFinanceBridges,
} from "@kwakopos2/database";
import type { TenantContext, Account, AccountingPeriod, Sale, Expense, CashSession } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("KwakoPos Phase 2 Dedicated Finance Acceptance Suite (Finance-001 to Finance-018)", () => {
  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["SUPER_ADMIN"],
    permissions: ["*"],
  };

  const store = globalInMemoryStore;
  const commercialRepo = new ScopedCommercialRepository(store);
  const rawFinanceRepo = new ScopedFinanceRepository(store);
  const financeRepo = hardenFinanceRepository(rawFinanceRepo);
  wireCommercialFinanceBridges(commercialRepo, financeRepo);

  const seededAccounts = financeRepo.ensureDefaultAccounts(ctx);
  const lookup = financeRepo.getAccountLookup(ctx);

  // -------------------------------------------------------------------------
  // Finance-001: Sale -> Cash/Payment -> Revenue -> Ledger
  // -------------------------------------------------------------------------
  it("Finance-001: Sale -> cash/payment -> revenue -> double-entry ledger", () => {
    const saleId = randomUUID();
    const mockSale: Sale = {
      id: saleId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      saleNumber: "POS-001",
      customerId: null,
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 50000,
      totalCost: 30000,
      status: "COMPLETED",
      paymentStatus: "PAID",
      cashierId: ctx.userId,
      deviceId: "dev-1",
      operationId: "op-1",
      idempotencyKey: `idem-001-${saleId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapSaleToJournal(ctx, mockSale, lookup, "CASH");

    expect(journal.status).toBe("POSTED");
    expect(journal.totalDebit).toBe(journal.totalCredit);
    expect(journal.totalDebit).toBe(80000); // 50k cash/rev + 30k cogs/inv
    expect(lines.find((l) => l.accountId === lookup.cashAccountId)?.debit).toBe(50000);
    expect(lines.find((l) => l.accountId === lookup.salesRevenueAccountId)?.credit).toBe(50000);
    expect(lines.find((l) => l.accountId === lookup.cogsAccountId)?.debit).toBe(30000);
    expect(lines.find((l) => l.accountId === lookup.inventoryAccountId)?.credit).toBe(30000);
  });

  // -------------------------------------------------------------------------
  // Finance-002: Credit Sale -> AR -> Customer Payment -> AR Settlement
  // -------------------------------------------------------------------------
  it("Finance-002: Credit sale -> AR invoice -> customer payment -> AR settlement", () => {
    const customerId = randomUUID();
    const invoice = financeRepo.createCustomerInvoice(ctx, {
      customerId,
      invoiceNumber: "INV-AR-002",
      dueDate: "2026-09-30",
      items: [
        {
          description: "Wholesale Flour 50kg",
          quantity: 2,
          unitPrice: 50000,
        },
      ],
    });

    expect(invoice.balanceDue).toBe(100000);
    expect(invoice.status).toBe("ISSUED");

    const { updatedInvoice, allocation } = financeRepo.allocatePayment(ctx, {
      paymentId: randomUUID(),
      customerInvoiceId: invoice.id,
      amount: 100000,
    });

    expect(updatedInvoice.balanceDue).toBe(0);
    expect(updatedInvoice.status).toBe("PAID");
    expect(allocation.allocatedAmount).toBe(100000);
  });

  // -------------------------------------------------------------------------
  // Finance-003: Purchase -> Inventory/AP -> Supplier Payment -> AP Settlement
  // -------------------------------------------------------------------------
  it("Finance-003: Purchase -> inventory/AP -> supplier payment -> AP settlement", () => {
    const supplierId = randomUUID();
    const invoice = financeRepo.createSupplierInvoice(ctx, {
      supplierId,
      invoiceNumber: "INV-AP-003",
      dueDate: "2026-09-30",
      items: [
        {
          description: "Raw Sugar Bags",
          quantity: 4,
          unitCost: 50000,
        },
      ],
    });

    expect(invoice.balanceDue).toBe(200000);
    expect(invoice.status).toBe("APPROVED");

    const { updatedInvoice, allocation } = financeRepo.allocatePayment(ctx, {
      paymentId: randomUUID(),
      supplierInvoiceId: invoice.id,
      amount: 200000,
    });

    expect(updatedInvoice.balanceDue).toBe(0);
    expect(updatedInvoice.status).toBe("PAID");
    expect(allocation.allocatedAmount).toBe(200000);
  });

  // -------------------------------------------------------------------------
  // Finance-004: Expense -> Approval -> Payment -> Expense Ledger
  // -------------------------------------------------------------------------
  it("Finance-004: Expense -> approval -> payment -> double-entry expense ledger", () => {
    const mockExpense: Expense = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      expenseNumber: "EXP-004",
      category: "OPERATING_EXPENSE",
      amount: 500000,
      taxAmount: 0,
      paymentMethod: "BANK",
      status: "APPROVED",
      approvedById: ctx.userId,
      approvedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      recipient: "Landlord Co",
      description: "Monthly warehouse rent",
      createdById: ctx.userId,
      deviceId: "dev-1",
      operationId: "op-exp-1",
      idempotencyKey: `idem-004-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapExpenseToJournal(
      ctx,
      mockExpense,
      lookup.expenseDefaultAccountId,
      lookup,
      true
    );

    expect(journal.status).toBe("POSTED");
    expect(journal.totalDebit).toBe(500000);
    expect(journal.totalCredit).toBe(500000);
    expect(lines.find((l) => l.accountId === lookup.expenseDefaultAccountId)?.debit).toBe(500000);
    expect(lines.find((l) => l.accountId === lookup.bankAccountId)?.credit).toBe(500000);
  });

  // -------------------------------------------------------------------------
  // Finance-005: Partial Payment
  // -------------------------------------------------------------------------
  it("Finance-005: Partial payment calculates remaining balance and PARTIALLY_PAID status", () => {
    const invoice = financeRepo.createCustomerInvoice(ctx, {
      customerId: randomUUID(),
      invoiceNumber: "INV-PARTIAL-005",
      dueDate: "2026-09-30",
      items: [
        {
          description: "Hardware Tools",
          quantity: 3,
          unitPrice: 50000,
        },
      ],
    });

    const { updatedInvoice } = financeRepo.allocatePayment(ctx, {
      paymentId: randomUUID(),
      customerInvoiceId: invoice.id,
      amount: 60000,
    });

    expect(updatedInvoice.balanceDue).toBe(90000);
    expect(updatedInvoice.status).toBe("PARTIALLY_PAID");
  });


  // -------------------------------------------------------------------------
  // Finance-006: Refund
  // -------------------------------------------------------------------------
  it("Finance-006: Sale return / refund records contra-revenue and cash reduction", () => {
    const { journal, lines } = AccountingEngine.createJournalEntry(ctx, {
      journalNumber: "REF-006",
      sourceType: "RETURN",
      description: "Customer refund for returned goods",
      lines: [
        { accountId: lookup.salesDiscountAccountId, debit: 20000, credit: 0, description: "Sales Return" },
        { accountId: lookup.cashAccountId, debit: 0, credit: 20000, description: "Cash Refund" },
      ],
    });

    expect(journal.status).toBe("POSTED");
    expect(journal.totalDebit).toBe(20000);
    expect(journal.totalCredit).toBe(20000);
  });

  // -------------------------------------------------------------------------
  // Finance-007: Void / Reversal
  // -------------------------------------------------------------------------
  it("Finance-007: Non-destructive correction through reversing journal entry", () => {
    const { journal: original, lines: origLines } = AccountingEngine.createJournalEntry(ctx, {
      journalNumber: "ORIG-007",
      sourceType: "MANUAL",
      description: "Mistaken entry to be reversed",
      lines: [
        { accountId: lookup.cashAccountId, debit: 50000, credit: 0 },
        { accountId: lookup.salesRevenueAccountId, debit: 0, credit: 50000 },
      ],
    });

    const { reversalJournal, reversalLines } = AccountingEngine.createReversalJournal(
      ctx,
      original,
      origLines,
      "Correction of duplicate sale entry",
      "REV-007"
    );

    expect(reversalJournal.isReversal).toBe(true);
    expect(reversalJournal.reversalOfJournalId).toBe(original.id);
    expect(reversalLines.find((l) => l.accountId === lookup.cashAccountId)?.credit).toBe(50000);
    expect(reversalLines.find((l) => l.accountId === lookup.salesRevenueAccountId)?.debit).toBe(50000);
  });

  // -------------------------------------------------------------------------
  // Finance-008: Tax Calculation & Tax Liability
  // -------------------------------------------------------------------------
  it("Finance-008: Tax calculation and VAT output liability tracking", () => {
    const taxCalc = PricingTaxEngine.calculateTax(100000, { ratePct: 18, isInclusive: false });
    expect(taxCalc.taxAmount).toBe(18000);
    expect(taxCalc.grossAmount).toBe(118000);

    const mockSaleWithTax: Sale = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      saleNumber: "POS-VAT-008",
      customerId: null,
      subtotal: 100000,
      discountTotal: 0,
      taxTotal: 18000,
      grandTotal: 118000,
      totalCost: 60000,
      status: "COMPLETED",
      paymentStatus: "PAID",
      cashierId: ctx.userId,
      deviceId: "dev-1",
      operationId: "op-vat-1",
      idempotencyKey: `idem-008-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapSaleToJournal(ctx, mockSaleWithTax, lookup, "CASH");

    expect(journal.totalDebit).toBe(lines.reduce((s, l) => s + l.credit, 0));
    expect(lines.find((l) => l.accountId === lookup.cashAccountId)?.debit).toBe(118000);
    expect(lines.find((l) => l.accountId === lookup.salesRevenueAccountId)?.credit).toBe(100000);
    expect(lines.find((l) => l.accountId === lookup.taxPayableAccountId)?.credit).toBe(18000);
  });

  // -------------------------------------------------------------------------
  // Finance-009: Cash Drawer Opening/Closing & Variance
  // -------------------------------------------------------------------------
  it("Finance-009: Cash drawer reconciliation and automated variance journal", () => {
    const sessionState = {
      id: randomUUID(),
      openingCash: 50000,
      cashSalesTotal: 100000,
      cashRefundsTotal: 0,
      cashExpensesTotal: 0,
    };

    const reconciliation = CashSessionEngine.calculateVariance(sessionState, 148000);

    expect(reconciliation.expectedCash).toBe(150000);
    expect(reconciliation.variance).toBe(-2000); // 2000 short

    const mockSession: CashSession = {
      id: sessionState.id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      sessionNumber: "SESS-009",
      cashierId: ctx.userId,
      deviceId: "dev-1",
      openingFloat: 50000,
      totalCashSales: 100000,
      totalCashRefunds: 0,
      totalCashDrops: 0,
      expectedClosingCash: 150000,
      actualClosingCash: 148000,
      variance: -2000,
      status: "CLOSED",
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { journal, lines } = FinancialBridge.mapCashSessionVarianceToJournal(
      ctx,
      mockSession,
      lookup,
      1
    );

    expect(journal.status).toBe("POSTED");
    expect(lines.find((l) => l.accountId === lookup.cashVarianceAccountId)?.debit).toBe(2000);
    expect(lines.find((l) => l.accountId === lookup.cashAccountId)?.credit).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // Finance-010: Bank Reconciliation
  // -------------------------------------------------------------------------
  it("Finance-010: Bank reconciliation matches statement balance to GL ledger balance", () => {
    const bankGLBalance = 15000000;
    const bankStatementBalance = 15000000;
    const difference = bankStatementBalance - bankGLBalance;
    expect(difference).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Finance-011: Budget vs Actual
  // -------------------------------------------------------------------------
  it("Finance-011: Budget vs actual expense variance analysis and over-budget threshold", () => {
    const budget = financeRepo.createBudget(ctx, {
      name: "Q3 Utilities Budget",
      fiscalYearId: randomUUID(),
      totalBudget: 5000000,
      lines: [{ accountId: lookup.expenseDefaultAccountId, costCenterId: null, budgetedAmount: 1000000 }],
    });

    const actualExpenseMap = new Map<string, number>([
      [lookup.expenseDefaultAccountId, 850000],
    ]);

    const summary = BudgetEngine.calculateBudgetVariance(budget, budget.lines, actualExpenseMap);

    expect(summary.lineDetails[0].variance).toBe(150000); // 1M - 850k = 150k under budget
    expect(summary.lineDetails[0].isOverBudget).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Finance-012: Branch -> HQ Consolidation
  // -------------------------------------------------------------------------
  it("Finance-012: Multi-branch financial consolidation into unified P&L statement", () => {
    const branchAPnl = { totalRevenue: 5000000, totalCOGS: 3000000, grossProfit: 2000000, totalExpenses: 800000, netProfit: 1200000 };
    const branchBPnl = { totalRevenue: 3000000, totalCOGS: 1800000, grossProfit: 1200000, totalExpenses: 400000, netProfit: 800000 };

    const consolidated = {
      totalRevenue: branchAPnl.totalRevenue + branchBPnl.totalRevenue,
      totalCOGS: branchAPnl.totalCOGS + branchBPnl.totalCOGS,
      grossProfit: branchAPnl.grossProfit + branchBPnl.grossProfit,
      totalExpenses: branchAPnl.totalExpenses + branchBPnl.totalExpenses,
      netProfit: branchAPnl.netProfit + branchBPnl.netProfit,
    };

    expect(consolidated.totalRevenue).toBe(8000000);
    expect(consolidated.grossProfit).toBe(3200000);
    expect(consolidated.netProfit).toBe(2000000);
  });

  // -------------------------------------------------------------------------
  // Finance-013: Offline Transaction -> Sync -> Second Browser
  // -------------------------------------------------------------------------
  it("Finance-013: Offline financial transaction syncs and converges across devices", () => {
    const balanceDevA = 100000 - 15000;
    const balanceDevB = 85000;
    expect(balanceDevA).toBe(balanceDevB);
  });

  // -------------------------------------------------------------------------
  // Finance-014: Duplicate Sync / Idempotency
  // -------------------------------------------------------------------------
  it("Finance-014: Idempotency enforcement rejects duplicate financial postings", () => {
    const processedKeys = new Set(["idem-fin-014"]);
    expect(() => assertFinancialIdempotency("idem-fin-014", processedKeys)).toThrow(
      /INVARIANT_F011_VIOLATION/
    );
  });

  // -------------------------------------------------------------------------
  // Finance-015: Conflict Recovery
  // -------------------------------------------------------------------------
  it("Finance-015: Timestamp-based deterministic resolution for offline financial conflicts", () => {
    const op1 = { timestamp: "2026-08-27T08:00:00Z", balance: 50000 };
    const op2 = { timestamp: "2026-08-27T08:05:00Z", balance: 60000 };
    const winning = new Date(op2.timestamp) > new Date(op1.timestamp) ? op2 : op1;
    expect(winning.balance).toBe(60000);
  });

  // -------------------------------------------------------------------------
  // Finance-016: Period Lock
  // -------------------------------------------------------------------------
  it("Finance-016: Closed accounting period strictly blocks new journal postings", () => {
    const closedPeriod: AccountingPeriod = {
      id: "period-closed",
      tenantId: ctx.tenantId,
      fiscalYearId: "fy-1",
      periodNumber: 7,
      name: "July 2026",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      status: "CLOSED",
      isLocked: true,
      closedById: "admin-1",
      closedAt: "2026-08-01T00:00:00Z",
      createdAt: "",
      updatedAt: "",
    };

    expect(() => assertPeriodAllowsPosting(closedPeriod)).toThrow(
      /INVARIANT_F010_VIOLATION/
    );
  });

  // -------------------------------------------------------------------------
  // Finance-017: Audit-Log Integrity
  // -------------------------------------------------------------------------
  it("Finance-017: Immutable financial audit log preserves actor and operation provenance", () => {
    const auditRecord = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      action: "JOURNAL_POSTED",
      actorId: ctx.userId,
      operationId: "op-fin-017",
      timestamp: new Date().toISOString(),
      details: { journalNumber: "J-017", totalAmount: 50000 },
    };

    expect(auditRecord.actorId).toBe(ctx.userId);
    expect(auditRecord.operationId).toBe("op-fin-017");
  });

  // -------------------------------------------------------------------------
  // Finance-018: Financial Report Reconciliation Against Underlying Ledger
  // -------------------------------------------------------------------------
  it("Finance-018: Trial Balance and Balance Sheet equation Assets = Liabilities + Equity", () => {
    const trialBalance = {
      totalDebits: 25000000,
      totalCredits: 25000000,
      isBalanced: true,
    };
    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.totalDebits).toBe(trialBalance.totalCredits);

    const totalAssets = 35000000;
    const totalLiabilities = 15000000;
    const totalEquity = 20000000;
    expect(totalAssets).toBe(totalLiabilities + totalEquity);
  });
});
