import { describe, it, expect } from "vitest";
import {
  assertJournalBalanced,
  assertJournalTenantIsolation,
  assertJournalSourceTraceability,
  assertPostedJournalImmutable,
  assertReversalReferencesOriginal,
  assertReceivableAuthoritativeBalance,
  assertPayableAuthoritativeBalance,
  assertInventoryFinancialReconciliation,
  assertCashReconciliation,
  assertPeriodAllowsPosting,
  assertFinancialIdempotency,
  assertBranchFinancialBoundary,
} from "../../packages/domain/src/index.js";
import type { JournalEntry, JournalLine, TenantContext, AccountingPeriod } from "@kwakopos2/contracts";

describe("KwakoPos Finance Core Invariants F001 - F012", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  it("INVARIANT F001: Enforces double-entry balance (Sum(Debit) === Sum(Credit))", () => {
    const balancedLines: JournalLine[] = [
      { id: "1", journalEntryId: "j1", accountId: "a1", debit: 50000, credit: 0, currency: "TZS", exchangeRate: 1 },
      { id: "2", journalEntryId: "j1", accountId: "a2", debit: 0, credit: 50000, currency: "TZS", exchangeRate: 1 },
    ];
    expect(() => assertJournalBalanced({ id: "j1" }, balancedLines)).not.toThrow();

    const imbalancedLines: JournalLine[] = [
      { id: "1", journalEntryId: "j1", accountId: "a1", debit: 50000, credit: 0, currency: "TZS", exchangeRate: 1 },
      { id: "2", journalEntryId: "j1", accountId: "a2", debit: 0, credit: 40000, currency: "TZS", exchangeRate: 1 },
    ];
    expect(() => assertJournalBalanced({ id: "j1" }, imbalancedLines)).toThrow(/INVARIANT_F001_VIOLATION/);
  });

  it("INVARIANT F002: Enforces strict tenant isolation for financial journals", () => {
    expect(() =>
      assertJournalTenantIsolation(dummyCtx, {
        tenantId: "99999999-9999-9999-9999-999999999999",
      })
    ).toThrow(/INVARIANT_F002_VIOLATION/);
  });

  it("INVARIANT F003: Ensures financial transaction source traceability", () => {
    expect(() =>
      assertJournalSourceTraceability({ sourceType: "SALE", sourceId: "sale-100" as any })
    ).not.toThrow();

    expect(() =>
      assertJournalSourceTraceability({ sourceType: "SALE", sourceId: null })
    ).toThrow(/INVARIANT_F003_VIOLATION/);

    expect(() =>
      assertJournalSourceTraceability({ sourceType: "INVALID" as any, sourceId: "s1" })
    ).toThrow(/INVARIANT_F003_VIOLATION/);
  });

  it("INVARIANT F004: Rejects direct mutation of posted journal entries", () => {
    const postedJournal: JournalEntry = {
      id: "j1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      accountingPeriodId: null,
      journalNumber: "JRN-MAIN-2026-0001",
      entryDate: new Date().toISOString(),
      postingDate: new Date().toISOString(),
      sourceType: "SALE",
      sourceId: "s1",
      description: "POS Sale",
      currency: "TZS",
      exchangeRate: 1,
      totalDebit: 10000,
      totalCredit: 10000,
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
    };

    expect(() => assertPostedJournalImmutable(postedJournal)).toThrow(/INVARIANT_F004_VIOLATION/);
  });

  it("INVARIANT F005: Ensures reversals reference existing original journal", () => {
    expect(() =>
      assertReversalReferencesOriginal({ isReversal: true, reversalOfJournalId: "j-orig" }, true)
    ).not.toThrow();

    expect(() =>
      assertReversalReferencesOriginal({ isReversal: true, reversalOfJournalId: "j-orig" }, false)
    ).toThrow(/INVARIANT_F005_VIOLATION/);
  });

  it("INVARIANT F006: Reconciles Accounts Receivable authoritative balance", () => {
    // Opening 10k + Invoices 50k + Debits 5k - Payments 40k - Credits 5k = 20k
    expect(() =>
      assertReceivableAuthoritativeBalance("cust-1", 20000, 10000, 50000, 5000, 40000, 5000)
    ).not.toThrow();

    expect(() =>
      assertReceivableAuthoritativeBalance("cust-1", 25000, 10000, 50000, 5000, 40000, 5000)
    ).toThrow(/INVARIANT_F006_VIOLATION/);
  });

  it("INVARIANT F007: Reconciles Accounts Payable authoritative balance", () => {
    // Opening 20k + Purchases 100k + Debits 0k - Payments 80k - Credits 10k = 30k
    expect(() =>
      assertPayableAuthoritativeBalance("sup-1", 30000, 20000, 100000, 0, 80000, 10000)
    ).not.toThrow();

    expect(() =>
      assertPayableAuthoritativeBalance("sup-1", 35000, 20000, 100000, 0, 80000, 10000)
    ).toThrow(/INVARIANT_F007_VIOLATION/);
  });

  it("INVARIANT F008: Validates Inventory GL financial reconciliation", () => {
    expect(() => assertInventoryFinancialReconciliation(150000, 150000)).not.toThrow();
    expect(() => assertInventoryFinancialReconciliation(150000, 140000)).toThrow(/INVARIANT_F008_VIOLATION/);
  });

  it("INVARIANT F009: Computes cash drawer variance and balanced state", () => {
    const balanced = assertCashReconciliation(150000, 150000);
    expect(balanced.isBalanced).toBe(true);
    expect(balanced.variance).toBe(0);

    const variance = assertCashReconciliation(145000, 150000);
    expect(variance.isBalanced).toBe(false);
    expect(variance.variance).toBe(-5000);
  });

  it("INVARIANT F010: Blocks posting into closed or locked accounting periods", () => {
    const openPeriod: AccountingPeriod = {
      id: "p1",
      tenantId: dummyCtx.tenantId,
      fiscalYearId: "fy1",
      periodNumber: 1,
      name: "2026-01",
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      status: "OPEN",
      closedAt: null,
      closedById: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => assertPeriodAllowsPosting(openPeriod)).not.toThrow();

    const closedPeriod = { ...openPeriod, status: "CLOSED" as const };
    expect(() => assertPeriodAllowsPosting(closedPeriod)).toThrow(/INVARIANT_F010_VIOLATION/);
  });

  it("INVARIANT F011: Enforces idempotency key uniqueness for financial mutations", () => {
    const keys = new Set(["KEY-1", "KEY-2"]);
    expect(() => assertFinancialIdempotency("KEY-1", keys)).toThrow(/INVARIANT_F011_VIOLATION/);
    expect(() => assertFinancialIdempotency("KEY-3", keys)).not.toThrow();
  });

  it("INVARIANT F012: Enforces branch financial authorization boundary", () => {
    expect(() => assertBranchFinancialBoundary(dummyCtx, dummyCtx.branchId)).not.toThrow();
    expect(() => assertBranchFinancialBoundary(dummyCtx, "other-branch-id")).toThrow(/INVARIANT_F012_VIOLATION/);
  });
});
