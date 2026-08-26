import { describe, it, expect } from "vitest";
import { AccountingEngine } from "../../packages/domain/src/index.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("KwakoPos Double-Entry Accounting Core Engine", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  it("seeds complete standard Chart of Accounts (1000 - 8000)", () => {
    const accounts = AccountingEngine.seedDefaultAccounts(dummyCtx);
    expect(accounts.length).toBeGreaterThanOrEqual(18);

    const codes = new Set(accounts.map((a) => a.accountCode));
    expect(codes.has("1110")).toBe(true); // Cash
    expect(codes.has("1210")).toBe(true); // Bank
    expect(codes.has("1310")).toBe(true); // AR
    expect(codes.has("1410")).toBe(true); // Inventory
    expect(codes.has("2110")).toBe(true); // AP
    expect(codes.has("2210")).toBe(true); // VAT Payable
    expect(codes.has("3100")).toBe(true); // Capital
    expect(codes.has("4100")).toBe(true); // Revenue
    expect(codes.has("5100")).toBe(true); // COGS
    expect(codes.has("6100")).toBe(true); // Rent
  });

  it("creates a balanced double-entry journal entry and validates totals", () => {
    const { journal, lines } = AccountingEngine.createJournalEntry(dummyCtx, {
      journalNumber: "JRN-MAIN-2026-0001",
      sourceType: "MANUAL",
      description: "Initial Capital Injection",
      lines: [
        { accountId: "acc-cash", debit: 5000000, credit: 0 },
        { accountId: "acc-equity", debit: 0, credit: 5000000 },
      ],
    });

    expect(journal.totalDebit).toBe(5000000);
    expect(journal.totalCredit).toBe(5000000);
    expect(journal.status).toBe("POSTED");
    expect(lines.length).toBe(2);
  });

  it("creates an exact immutable reversal journal with inverted debits/credits", () => {
    const { journal, lines } = AccountingEngine.createJournalEntry(dummyCtx, {
      journalNumber: "JRN-MAIN-2026-0001",
      sourceType: "EXPENSE",
      sourceId: "exp-1",
      description: "Rent Expense",
      lines: [
        { accountId: "acc-rent", debit: 300000, credit: 0 },
        { accountId: "acc-cash", debit: 0, credit: 300000 },
      ],
    });

    const { reversalJournal, reversalLines } = AccountingEngine.createReversalJournal(
      dummyCtx,
      journal,
      lines,
      "Duplicate booking correction",
      "REV-MAIN-2026-0001"
    );

    expect(reversalJournal.isReversal).toBe(true);
    expect(reversalJournal.reversalOfJournalId).toBe(journal.id);
    expect(reversalJournal.sourceType).toBe("REVERSAL");
    expect(reversalJournal.totalDebit).toBe(300000);
    expect(reversalJournal.totalCredit).toBe(300000);

    // Verify lines are inverted
    const reversedRentLine = reversalLines.find((l) => l.accountId === "acc-rent")!;
    expect(reversedRentLine.debit).toBe(0);
    expect(reversedRentLine.credit).toBe(300000);
  });

  it("calculates account balances according to class normal balances", () => {
    // ASSET (Debit increases, Credit decreases)
    const assetLines = [
      { id: "1", journalEntryId: "j1", accountId: "a1", debit: 100000, credit: 0, currency: "TZS", exchangeRate: 1 },
      { id: "2", journalEntryId: "j2", accountId: "a1", debit: 0, credit: 25000, currency: "TZS", exchangeRate: 1 },
    ];
    const assetBalance = AccountingEngine.computeAccountBalance("ASSET", 0, assetLines);
    expect(assetBalance).toBe(75000);

    // LIABILITY (Credit increases, Debit decreases)
    const liabilityLines = [
      { id: "3", journalEntryId: "j3", accountId: "a2", debit: 0, credit: 200000, currency: "TZS", exchangeRate: 1 },
      { id: "4", journalEntryId: "j4", accountId: "a2", debit: 50000, credit: 0, currency: "TZS", exchangeRate: 1 },
    ];
    const liabilityBalance = AccountingEngine.computeAccountBalance("LIABILITY", 0, liabilityLines);
    expect(liabilityBalance).toBe(150000);
  });
});
