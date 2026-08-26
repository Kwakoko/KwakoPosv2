import type { TenantContext } from "@kwakopos2/contracts";
import type { ScopedCommercialRepository, ScopedFinanceRepository } from "./index.js";

const MUTATION_GUARDS = Symbol("kwakopos.finance.hardening");

function assertContextBranch(ctx: TenantContext, resourceTenantId: string, resourceBranchId?: string | null) {
  if (ctx.tenantId !== resourceTenantId) {
    throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION");
  }
  if (resourceBranchId && ctx.branchId !== resourceBranchId) {
    throw new Error("FINANCE_BRANCH_BOUNDARY_VIOLATION");
  }
}

function findExistingSourceJournal(finance: ScopedFinanceRepository, tenantId: string, sourceType: string, sourceId: string) {
  return Array.from(finance.journalEntries.values()).find(
    (journal) => journal.tenantId === tenantId && journal.sourceType === sourceType && journal.sourceId === sourceId && !journal.isReversal
  );
}

export function hardenFinanceRepository(finance: ScopedFinanceRepository) {
  const candidate = finance as ScopedFinanceRepository & { [MUTATION_GUARDS]?: boolean };
  if (candidate[MUTATION_GUARDS]) return finance;
  candidate[MUTATION_GUARDS] = true;

  const originalCreateAccount = finance.createAccount.bind(finance);
  finance.createAccount = ((ctx: TenantContext, req: any) => {
    const branchId = req.branchId ?? ctx.branchId;
    if (branchId !== ctx.branchId) throw new Error("FINANCE_BRANCH_BOUNDARY_VIOLATION");
    const duplicate = finance.getAccountByCode(ctx, req.accountCode);
    if (duplicate) throw new Error(`FINANCE_ACCOUNT_CODE_EXISTS:${req.accountCode}`);
    return originalCreateAccount(ctx, { ...req, branchId });
  }) as any;

  const originalCreateAccountingPeriod = finance.createAccountingPeriod.bind(finance);
  finance.createAccountingPeriod = ((ctx: TenantContext, req: any) => {
    const fiscalYear = finance.getFiscalYears(ctx).find((fy) => fy.id === req.fiscalYearId);
    if (!fiscalYear) throw new Error("FINANCE_FISCAL_YEAR_NOT_FOUND");
    if (fiscalYear.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION");
    if (req.periodNumber < 1 || req.periodNumber > 12) throw new Error("FINANCE_INVALID_PERIOD");
    const duplicate = finance.getAccountingPeriods(ctx).some(
      (p) => p.fiscalYearId === req.fiscalYearId && p.periodNumber === req.periodNumber
    );
    if (duplicate) throw new Error("FINANCE_PERIOD_EXISTS");
    return originalCreateAccountingPeriod(ctx, req);
  }) as any;

  const originalCreateJournalEntry = finance.createJournalEntry.bind(finance);
  finance.createJournalEntry = ((ctx: TenantContext, req: any) => {
    if (req.accountingPeriodId) {
      const period = finance.accountingPeriods.get(req.accountingPeriodId);
      if (!period) throw new Error("FINANCE_PERIOD_NOT_FOUND");
      if (period.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION");
    }
    const existingByKey = req.idempotencyKey
      ? Array.from(finance.journalEntries.values()).find(
          (j) => j.tenantId === ctx.tenantId && j.idempotencyKey === req.idempotencyKey
        )
      : undefined;
    if (existingByKey) return { journal: existingByKey, lines: finance.journalLines.get(existingByKey.id) || [] };
    return originalCreateJournalEntry(ctx, req);
  }) as any;

  const originalAllocatePayment = finance.allocatePayment.bind(finance);
  finance.allocatePayment = ((ctx: TenantContext, req: any) => {
    const target = req.customerInvoiceId
      ? finance.customerInvoices.get(req.customerInvoiceId)
      : finance.supplierInvoices.get(req.supplierInvoiceId);
    if (!target) throw new Error("Target invoice not found for payment allocation");
    assertContextBranch(ctx, target.tenantId, target.branchId);
    return originalAllocatePayment(ctx, req);
  }) as any;

  const originalRecordBankTransaction = finance.recordBankTransaction.bind(finance);
  finance.recordBankTransaction = ((ctx: TenantContext, bankAccountId: string, req: any) => {
    const bank = finance.bankAccounts.get(bankAccountId);
    if (!bank) throw new Error(`Bank account ${bankAccountId} not found`);
    assertContextBranch(ctx, bank.tenantId, bank.branchId);
    if (req.id && finance.bankTransactions.has(req.id)) {
      return finance.bankTransactions.get(req.id);
    }
    return originalRecordBankTransaction(ctx, bankAccountId, req);
  }) as any;

  const originalCreateBudget = finance.createBudget.bind(finance);
  finance.createBudget = ((ctx: TenantContext, req: any) => {
    for (const line of req.lines || []) {
      const account = finance.accounts.get(line.accountId);
      if (!account) throw new Error(`Budget account ${line.accountId} not found`);
      if (account.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION");
      if (account.branchId && account.branchId !== ctx.branchId) throw new Error("FINANCE_BRANCH_BOUNDARY_VIOLATION");
    }
    return originalCreateBudget(ctx, req);
  }) as any;

  const originalGetExecutiveDashboard = finance.getExecutiveDashboard.bind(finance);
  finance.getExecutiveDashboard = ((ctx: TenantContext) => {
    const dashboard = originalGetExecutiveDashboard(ctx) as any;
    const budgets = finance.getBudgets(ctx);
    const latestBudget = budgets[budgets.length - 1];
    if (latestBudget && Number(latestBudget.totalBudget) > 0) {
      const actualExpense = dashboard.operatingExpenses || 0;
      dashboard.budgetVariancePct = Math.round(((actualExpense - Number(latestBudget.totalBudget)) / Number(latestBudget.totalBudget)) * 10000) / 100;
    } else {
      dashboard.budgetVariancePct = 0;
    }
    return dashboard;
  }) as any;

  return finance;
}

export function wireCommercialFinanceBridges(
  commercial: ScopedCommercialRepository,
  finance: ScopedFinanceRepository
) {
  const marker = "__kwakoposFinanceBridgeWired" as const;
  const target = commercial as any;
  if (target[marker]) return commercial;
  target[marker] = true;

  const originalSale = commercial.createPosSale.bind(commercial);
  commercial.createPosSale = ((ctx: TenantContext, req: any) => {
    const result = originalSale(ctx, req);
    const sale = result.sale;
    const existing = findExistingSourceJournal(finance, ctx.tenantId, "SALE", sale.id);
    if (!existing) {
      const tender = req.payments?.[0]?.paymentMethod === "BANK"
        ? "BANK"
        : req.payments?.[0]?.paymentMethod === "CREDIT"
          ? "CREDIT"
          : req.payments?.[0]?.paymentMethod === "MOBILE_MONEY"
            ? "MOBILE_MONEY"
            : "CASH";
      finance.bridgeCommercialSale(ctx, sale, tender as any);
    }
    return result;
  }) as any;

  const originalReceipt = commercial.createPurchaseReceipt.bind(commercial);
  commercial.createPurchaseReceipt = ((ctx: TenantContext, req: any) => {
    const result = originalReceipt(ctx, req);
    const receipt = result.receipt;
    const existing = findExistingSourceJournal(finance, ctx.tenantId, "PURCHASE", receipt.id);
    if (!existing) finance.bridgePurchaseReceipt(ctx, receipt);
    return result;
  }) as any;

  const originalExpense = commercial.recordExpense.bind(commercial);
  commercial.recordExpense = ((ctx: TenantContext, req: any) => {
    const result = originalExpense(ctx, req);
    const existing = findExistingSourceJournal(finance, ctx.tenantId, "EXPENSE", result.id);
    if (!existing) finance.bridgeExpense(ctx, result);
    return result;
  }) as any;

  return commercial;
}
