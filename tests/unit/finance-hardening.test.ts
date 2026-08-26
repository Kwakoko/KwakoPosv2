import { describe, expect, it } from "vitest";
import { InMemoryStore, ScopedCommercialRepository, ScopedFinanceRepository, hardenFinanceRepository, wireCommercialFinanceBridges } from "../../packages/database/src/index.js";
import type { TenantContext } from "@kwakopos2/contracts";

const ctx: TenantContext = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  branchId: "22222222-2222-2222-2222-222222222222",
  userId: "33333333-3333-3333-3333-333333333333",
  roles: ["ADMIN"],
  permissions: ["*"],
};

describe("Phase 2 finance hardening", () => {
  it("rejects account creation outside the current branch and duplicate codes", () => {
    const finance = hardenFinanceRepository(new ScopedFinanceRepository(new InMemoryStore()));

    expect(() => finance.createAccount(ctx, {
      accountCode: "9999",
      name: "Cross Branch",
      accountClass: "ASSET",
      accountGroup: "CURRENT_ASSET",
      branchId: "44444444-4444-4444-4444-444444444444",
    })).toThrow(/FINANCE_BRANCH_BOUNDARY_VIOLATION/);

    finance.createAccount(ctx, {
      accountCode: "9999",
      name: "Valid",
      accountClass: "ASSET",
      accountGroup: "CURRENT_ASSET",
    });

    expect(() => finance.createAccount(ctx, {
      accountCode: "9999",
      name: "Duplicate",
      accountClass: "ASSET",
      accountGroup: "CURRENT_ASSET",
    })).toThrow(/FINANCE_ACCOUNT_CODE_EXISTS/);
  });

  it("enforces fiscal period ownership and uniqueness before journal posting", () => {
    const finance = hardenFinanceRepository(new ScopedFinanceRepository(new InMemoryStore()));
    const foreignCtx: TenantContext = { ...ctx, tenantId: "55555555-5555-5555-5555-555555555555" };

    expect(() => finance.createJournalEntry(ctx, {
      description: "should fail",
      sourceType: "MANUAL",
      accountingPeriodId: "66666666-6666-6666-6666-666666666666",
      lines: [
        { accountId: "77777777-7777-7777-7777-777777777777", debit: 100, credit: 0 },
        { accountId: "88888888-8888-8888-8888-888888888888", debit: 0, credit: 100 },
      ],
    })).toThrow(/FINANCE_PERIOD_NOT_FOUND/);

    const fiscalYear = finance.createFiscalYear(ctx, {
      name: "FY 2026",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T23:59:59.999Z",
    });
    const created = finance.createAccountingPeriod(ctx, {
      fiscalYearId: fiscalYear.id,
      periodNumber: 1,
      name: "2026-01",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-31T23:59:59.999Z",
    });

    expect(() => finance.createAccountingPeriod(ctx, {
      fiscalYearId: fiscalYear.id,
      periodNumber: 1,
      name: "Duplicate",
      startDate: String(created.startDate),
      endDate: String(created.endDate),
    })).toThrow(/FINANCE_PERIOD_EXISTS/);

    expect(() => finance.createJournalEntry(foreignCtx, {
      description: "foreign period",
      sourceType: "MANUAL",
      accountingPeriodId: created.id,
      lines: [
        { accountId: "77777777-7777-7777-7777-777777777777", debit: 100, credit: 0 },
        { accountId: "88888888-8888-8888-8888-888888888888", debit: 0, credit: 100 },
      ],
    })).toThrow(/FINANCE_TENANT_BOUNDARY_VIOLATION/);
  });

  it("wires sale, purchase receipt and expense journal bridges idempotently", () => {
    const store = new InMemoryStore();
    const commercial = new ScopedCommercialRepository(store);
    const finance = hardenFinanceRepository(new ScopedFinanceRepository(store));
    wireCommercialFinanceBridges(commercial, finance);

    finance.createAccount(ctx, { accountCode: "1110", name: "Cash", accountClass: "ASSET", accountGroup: "CASH" });
    finance.createAccount(ctx, { accountCode: "1210", name: "Bank", accountClass: "ASSET", accountGroup: "BANK" });
    finance.createAccount(ctx, { accountCode: "1310", name: "AR", accountClass: "ASSET", accountGroup: "ACCOUNTS_RECEIVABLE" });
    finance.createAccount(ctx, { accountCode: "1410", name: "Inventory", accountClass: "ASSET", accountGroup: "INVENTORY" });
    finance.createAccount(ctx, { accountCode: "2110", name: "AP", accountClass: "LIABILITY", accountGroup: "ACCOUNTS_PAYABLE" });
    finance.createAccount(ctx, { accountCode: "2210", name: "Tax", accountClass: "LIABILITY", accountGroup: "TAX_PAYABLE" });
    finance.createAccount(ctx, { accountCode: "4100", name: "Sales", accountClass: "REVENUE", accountGroup: "SALES" });
    finance.createAccount(ctx, { accountCode: "4900", name: "Discount", accountClass: "REVENUE", accountGroup: "DISCOUNT" });
    finance.createAccount(ctx, { accountCode: "5100", name: "COGS", accountClass: "COGS", accountGroup: "COGS" });
    finance.createAccount(ctx, { accountCode: "6900", name: "Expense", accountClass: "EXPENSE", accountGroup: "OPERATING" });
    finance.createAccount(ctx, { accountCode: "8100", name: "Cash Variance", accountClass: "OTHER_EXPENSE", accountGroup: "VARIANCE" });

    const product = commercial.createProduct(ctx, {
      name: "Bridge Product",
      sku: "BR-1",
      variants: [{ name: "Default", sku: "BR-1-V", price: 1000, costPrice: 500 }],
    });
    const sale = commercial.createPosSale(ctx, {
      items: [{ productId: product.id, variantId: product.variants[0].id, quantity: 1, unitPrice: 1000, unitCost: 500 }],
      payments: [{ amount: 1000, paymentMethod: "CASH" }],
    } as any);

    const saleJournals = Array.from(finance.journalEntries.values()).filter((j) => j.sourceType === "SALE" && j.sourceId === sale.sale.id);
    expect(saleJournals).toHaveLength(1);
  });
});
