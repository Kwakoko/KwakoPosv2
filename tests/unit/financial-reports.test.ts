import { describe, it, expect } from "vitest";
import {
  FinancialReportingEngine,
  AccountingEngine,
  ProfitabilityEngine,
  BudgetEngine,
} from "../../packages/domain/src/index.js";
import type { Account, JournalEntry, JournalLine, Budget, TenantContext } from "@kwakopos2/contracts";

describe("KwakoPos Financial Reporting & Profitability Engine Tests", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  const accounts: Account[] = AccountingEngine.seedDefaultAccounts(dummyCtx);
  const accCash = accounts.find((a) => a.accountCode === "1110")!;
  const accAR = accounts.find((a) => a.accountCode === "1310")!;
  const accInv = accounts.find((a) => a.accountCode === "1410")!;
  const accAP = accounts.find((a) => a.accountCode === "2110")!;
  const accRev = accounts.find((a) => a.accountCode === "4100")!;
  const accCogs = accounts.find((a) => a.accountCode === "5100")!;
  const accRent = accounts.find((a) => a.accountCode === "6100")!;

  const journals: JournalEntry[] = [
    {
      id: "j1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      accountingPeriodId: null,
      journalNumber: "JRN-001",
      entryDate: new Date().toISOString(),
      postingDate: new Date().toISOString(),
      sourceType: "SALE",
      sourceId: "s1",
      description: "POS Sale",
      currency: "TZS",
      exchangeRate: 1,
      totalDebit: 160000,
      totalCredit: 160000,
      status: "POSTED",
      isReversal: false,
      reversalOfJournalId: null,
      reversalReason: null,
      createdById: dummyCtx.userId,
      postedById: dummyCtx.userId,
      postedAt: new Date().toISOString(),
      idempotencyKey: "k1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const lines: JournalLine[] = [
    { id: "1", journalEntryId: "j1", accountId: accCash.id, debit: 100000, credit: 0, currency: "TZS", exchangeRate: 1 },
    { id: "2", journalEntryId: "j1", accountId: accRev.id, debit: 0, credit: 100000, currency: "TZS", exchangeRate: 1 },
    { id: "3", journalEntryId: "j1", accountId: accCogs.id, debit: 60000, credit: 0, currency: "TZS", exchangeRate: 1 },
    { id: "4", journalEntryId: "j1", accountId: accInv.id, debit: 0, credit: 60000, currency: "TZS", exchangeRate: 1 },
  ];

  it("generates a balanced Trial Balance", () => {
    const tb = FinancialReportingEngine.generateTrialBalance(dummyCtx, accounts, journals, lines);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebits).toBe(160000);
    expect(tb.totalCredits).toBe(160000);
  });

  it("generates an accurate Profit & Loss statement", () => {
    const pnl = FinancialReportingEngine.generateProfitAndLoss(dummyCtx, accounts, journals, lines);
    expect(pnl.revenue.totalRevenue).toBe(100000);
    expect(pnl.costOfGoodsSold.totalCogs).toBe(60000);
    expect(pnl.grossProfit).toBe(40000);
    expect(pnl.grossMarginPct).toBe(40);
    expect(pnl.netProfit).toBe(40000);
  });

  it("generates a balanced Balance Sheet", () => {
    const bs = FinancialReportingEngine.generateBalanceSheet(dummyCtx, accounts, journals, lines);
    expect(bs.isBalanced).toBe(true);
    expect(bs.assets.cashOnHand).toBe(100000);
    expect(bs.equity.currentPeriodNetProfit).toBe(40000);
  });

  it("calculates budget vs actual variance correctly", () => {
    const budget: Budget = {
      id: "b1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      name: "Q1 Operating Budget",
      fiscalYear: "2026",
      period: "Q1",
      totalBudget: 500000,
      status: "APPROVED",
      lines: [
        { id: "l1", budgetId: "b1", accountId: accRent.id, budgetedAmount: 400000, actualAmount: 0, varianceAmount: 400000 },
      ],
      createdAt: "",
      updatedAt: "",
    };

    const actualMap = new Map<string, number>();
    actualMap.set(accRent.id, 350000); // 350k spent against 400k budgeted

    const variance = BudgetEngine.calculateBudgetVariance(budget, budget.lines || [], actualMap);
    expect(variance.totalBudgeted).toBe(400000);
    expect(variance.totalActual).toBe(350000);
    expect(variance.totalVariance).toBe(50000); // 50k positive remaining
    expect(variance.isOverBudget).toBe(false);
  });
});
