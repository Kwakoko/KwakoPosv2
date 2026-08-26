import { describe, it, expect } from "vitest";
import { ScopedFinanceRepository, globalInMemoryStore } from "../../packages/database/src/index.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("KwakoPos Financial Periods & Year Closing Lifecycle Tests", () => {
  const dummyCtx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  let financeRepo: ScopedFinanceRepository;

  it("creates fiscal year and accounting periods", () => {
    financeRepo = new ScopedFinanceRepository(globalInMemoryStore);
    const fy = financeRepo.createFiscalYear(dummyCtx, {
      name: "FY 2026",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T23:59:59.999Z",
    });
    expect(fy.name).toBe("FY 2026");
    expect(fy.status).toBe("OPEN");

    const p1 = financeRepo.createAccountingPeriod(dummyCtx, {
      fiscalYearId: fy.id,
      periodNumber: 1,
      name: "2026-01",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-31T23:59:59.999Z",
    });
    expect(p1.periodNumber).toBe(1);
    expect(p1.status).toBe("OPEN");
  });

  it("closes an accounting period and rejects postings into it", () => {
    const periods = financeRepo.getAccountingPeriods(dummyCtx);
    const p1 = periods[0];

    const closed = financeRepo.closePeriod(dummyCtx, p1.id);
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).toBeDefined();

    // Attempt posting into closed period throws F010 violation
    const accounts = financeRepo.ensureDefaultAccounts(dummyCtx);
    expect(() =>
      financeRepo.createJournalEntry(dummyCtx, {
        accountingPeriodId: p1.id,
        sourceType: "MANUAL",
        description: "Late Entry",
        lines: [
          { accountId: accounts[0].id, debit: 10000, credit: 0 },
          { accountId: accounts[1].id, debit: 0, credit: 10000 },
        ],
      })
    ).toThrow(/INVARIANT_F010_VIOLATION/);
  });

  it("reopens a closed accounting period and permits posting again", () => {
    const periods = financeRepo.getAccountingPeriods(dummyCtx);
    const p1 = periods[0];

    const reopened = financeRepo.reopenPeriod(dummyCtx, p1.id);
    expect(reopened.status).toBe("OPEN");
    expect(reopened.closedAt).toBeNull();

    // Now posting succeeds
    const accounts = financeRepo.ensureDefaultAccounts(dummyCtx);
    const { journal } = financeRepo.createJournalEntry(dummyCtx, {
      accountingPeriodId: p1.id,
      sourceType: "MANUAL",
      description: "Post-Reopen Entry",
      lines: [
        { accountId: accounts[0].id, debit: 10000, credit: 0 },
        { accountId: accounts[1].id, debit: 0, credit: 10000 },
      ],
    });
    expect(journal.status).toBe("POSTED");
  });
});
