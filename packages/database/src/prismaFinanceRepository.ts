import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { AccountingEngine, FinancialReportingEngine, TransactionNumbering, FinancialBridge } from "@kwakopos2/domain";


const num = (v: unknown) => Number(v ?? 0);

export class PrismaFinanceRepository {
  constructor(private readonly db: any = prisma) {}

  private assertTenant(ctx: TenantContext, row: any, branchScoped = true) {
    if (!row || row.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION");
    if (branchScoped && row.branchId && row.branchId !== ctx.branchId) throw new Error("FINANCE_BRANCH_BOUNDARY_VIOLATION");
  }

  async getAccounts(ctx: TenantContext) {
    return this.db.account.findMany({ where: { tenantId: ctx.tenantId, OR: [{ branchId: ctx.branchId }, { branchId: null }] }, orderBy: { accountCode: "asc" } });
  }

  async ensureDefaultAccounts(ctx: TenantContext) {
    const accounts = await this.getAccounts(ctx);
    if (accounts.length) return accounts;
    const seed = AccountingEngine.seedDefaultAccounts(ctx) as any[];
    for (const a of seed) {
      await this.db.account.create({ data: { id: a.id, tenantId: ctx.tenantId, branchId: a.branchId ?? ctx.branchId, accountCode: a.accountCode, name: a.name, accountClass: a.accountClass, accountGroup: a.accountGroup, currency: a.currency ?? "TZS", isSystem: true, isActive: true, currentBalance: 0, description: a.description ?? null } });
    }
    return this.getAccounts(ctx);
  }

  async getAccountByCode(ctx: TenantContext, code: string) {
    return this.db.account.findFirst({ where: { tenantId: ctx.tenantId, accountCode: code, OR: [{ branchId: ctx.branchId }, { branchId: null }] } });
  }

  async createAccount(ctx: TenantContext, req: any) {
    if (req.branchId && req.branchId !== ctx.branchId) throw new Error("FINANCE_BRANCH_BOUNDARY_VIOLATION");
    if (await this.getAccountByCode(ctx, req.accountCode)) throw new Error(`FINANCE_ACCOUNT_CODE_EXISTS:${req.accountCode}`);
    return this.db.account.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: req.branchId ?? ctx.branchId, accountCode: req.accountCode, name: req.name, accountClass: req.accountClass, accountGroup: req.accountGroup, currency: req.currency ?? "TZS", isSystem: false, isActive: true, currentBalance: 0, description: req.description ?? null } });
  }

  async updateAccount(ctx: TenantContext, id: string, req: any) {
    const row = await this.db.account.findUnique({ where: { id } }); this.assertTenant(ctx, row, false);
    return this.db.account.update({ where: { id }, data: { name: req.name, accountGroup: req.accountGroup, description: req.description, isActive: req.isActive } });
  }

  async getFiscalYears(ctx: TenantContext) { return this.db.fiscalYear.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { startDate: "asc" } }); }
  async createFiscalYear(ctx: TenantContext, req: any) { return this.db.fiscalYear.create({ data: { tenantId: ctx.tenantId, name: req.name, startDate: new Date(req.startDate), endDate: new Date(req.endDate), status: "OPEN", isClosed: false } }); }

  async getAccountingPeriods(ctx: TenantContext) { return this.db.accountingPeriod.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { periodNumber: "asc" } }); }
  async createAccountingPeriod(ctx: TenantContext, req: any) {
    const fy = await this.db.fiscalYear.findUnique({ where: { id: req.fiscalYearId } });
    if (!fy) throw new Error("FINANCE_FISCAL_YEAR_NOT_FOUND");
    if (fy.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION");
    if (await this.db.accountingPeriod.findFirst({ where: { tenantId: ctx.tenantId, fiscalYearId: req.fiscalYearId, periodNumber: req.periodNumber } })) throw new Error("FINANCE_PERIOD_EXISTS");
    return this.db.accountingPeriod.create({ data: { tenantId: ctx.tenantId, fiscalYearId: req.fiscalYearId, periodNumber: req.periodNumber, name: req.name, startDate: new Date(req.startDate), endDate: new Date(req.endDate), status: "OPEN", isClosed: false } });
  }
  async closePeriod(ctx: TenantContext, id: string) { const p = await this.db.accountingPeriod.findUnique({ where: { id } }); this.assertTenant(ctx, p, false); return this.db.accountingPeriod.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId } }); }
  async reopenPeriod(ctx: TenantContext, id: string) { const p = await this.db.accountingPeriod.findUnique({ where: { id } }); this.assertTenant(ctx, p, false); return this.db.accountingPeriod.update({ where: { id }, data: { status: "OPEN", closedAt: null, closedById: null } }); }

  async getJournals(ctx: TenantContext) { return this.db.journalEntry.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true }, orderBy: { entryDate: "desc" } }); }
  async getJournalById(ctx: TenantContext, id: string) { const j = await this.db.journalEntry.findUnique({ where: { id }, include: { lines: true } }); if (!j) return null; this.assertTenant(ctx, j); return { journal: j, lines: j.lines }; }

  async createJournalEntry(ctx: TenantContext, req: any) {
    if (req.idempotencyKey) { const existing = await this.db.journalEntry.findUnique({ where: { idempotencyKey: req.idempotencyKey }, include: { lines: true } }); if (existing) { this.assertTenant(ctx, existing); return { journal: existing, lines: existing.lines }; } }
    if (req.accountingPeriodId) { const p = await this.db.accountingPeriod.findUnique({ where: { id: req.accountingPeriodId } }); if (!p) throw new Error("FINANCE_PERIOD_NOT_FOUND"); if (p.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION"); if (["CLOSING", "CLOSED", "LOCKED"].includes(p.status)) throw new Error("INVARIANT_F010_VIOLATION"); }
    const sequence = (await this.db.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1;
    const built = AccountingEngine.createJournalEntry(ctx, { ...req, journalNumber: req.journalNumber ?? TransactionNumbering.formatNumber("JRN", "MAIN", sequence) });
    return this.db.$transaction(async (tx: any) => {
      const j = await tx.journalEntry.create({ data: { id: built.journal.id, tenantId: ctx.tenantId, branchId: ctx.branchId, accountingPeriodId: req.accountingPeriodId ?? null, journalNumber: built.journal.journalNumber, entryDate: new Date(built.journal.entryDate), postingDate: new Date(built.journal.postingDate), sourceType: built.journal.sourceType, sourceId: built.journal.sourceId ?? null, description: built.journal.description, currency: built.journal.currency, exchangeRate: built.journal.exchangeRate, totalDebit: built.journal.totalDebit, totalCredit: built.journal.totalCredit, status: built.journal.status, isReversal: built.journal.isReversal, reversalOfJournalId: built.journal.reversalOfJournalId ?? null, reversalReason: built.journal.reversalReason ?? null, createdById: ctx.userId, postedById: ctx.userId, postedAt: new Date(), idempotencyKey: req.idempotencyKey ?? `jrn-${built.journal.id}` } });
      const lines = await Promise.all((built.lines as any[]).map((l) => tx.journalLine.create({ data: { id: l.id, journalEntryId: j.id, accountId: l.accountId, costCenterId: l.costCenterId ?? null, description: l.description ?? null, debit: l.debit, credit: l.credit, currency: l.currency ?? built.journal.currency, exchangeRate: l.exchangeRate ?? built.journal.exchangeRate } })));
      return { journal: j, lines };
    });
  }

  async reverseJournalEntry(ctx: TenantContext, id: string, req: any) {
    const original = await this.getJournalById(ctx, id);
    if (!original) throw new Error(`Journal ${id} not found`);
    if (original.journal.status === "REVERSED") throw new Error("JOURNAL_ALREADY_REVERSED");
    const count = await this.db.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } });
    const number = `REV-MAIN-${count + 1}`;
    const built = AccountingEngine.createReversalJournal(ctx, original.journal as any, original.lines as any, req.reason, number);
    return this.db.$transaction(async (tx: any) => {
      await tx.journalEntry.update({ where: { id }, data: { status: "REVERSED" } });
      const j = await tx.journalEntry.create({
        data: {
          id: built.reversalJournal.id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          accountingPeriodId: built.reversalJournal.accountingPeriodId ?? null,
          journalNumber: built.reversalJournal.journalNumber,
          entryDate: new Date(built.reversalJournal.entryDate),
          postingDate: new Date(built.reversalJournal.postingDate),
          sourceType: "REVERSAL",
          sourceId: id,
          description: built.reversalJournal.description,
          currency: built.reversalJournal.currency,
          exchangeRate: built.reversalJournal.exchangeRate,
          totalDebit: built.reversalJournal.totalDebit,
          totalCredit: built.reversalJournal.totalCredit,
          status: "POSTED",
          isReversal: true,
          reversalOfJournalId: id,
          reversalReason: req.reason,
          createdById: ctx.userId,
          postedById: ctx.userId,
          postedAt: new Date(),
          idempotencyKey: `jrn-rev-${id}`,
        },
      });
      const lines = await Promise.all(
        (built.reversalLines as any[]).map((l) =>
          tx.journalLine.create({
            data: {
              id: l.id,
              journalEntryId: j.id,
              accountId: l.accountId,
              costCenterId: l.costCenterId ?? null,
              description: l.description ?? null,
              debit: l.debit,
              credit: l.credit,
              currency: l.currency ?? j.currency,
              exchangeRate: l.exchangeRate ?? j.exchangeRate,
            },
          })
        )
      );
      return { reversalJournal: j, reversalLines: lines };
    });
  }


  async getCustomerInvoices(ctx: TenantContext) { return this.db.customerInvoice.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true, allocations: true } }); }
  async getSupplierInvoices(ctx: TenantContext) { return this.db.supplierInvoice.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true, allocations: true } }); }
  async createCustomerInvoice(ctx: TenantContext, req: any) { const c = await this.db.customer.findUnique({ where: { id: req.customerId } }); this.assertTenant(ctx, c); const subtotal = req.items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0); const tax = req.items.reduce((s: number, i: any) => s + (i.taxRate ? i.quantity * i.unitPrice * i.taxRate / 100 : 0), 0); const discount = req.items.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0); const total = subtotal + tax - discount; return this.db.customerInvoice.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, customerId: req.customerId, saleId: req.saleId ?? null, invoiceNumber: req.invoiceNumber ?? `INV-${Date.now()}`, invoiceDate: req.invoiceDate ? new Date(req.invoiceDate) : new Date(), dueDate: new Date(req.dueDate), subtotal, taxTotal: tax, discountTotal: discount, grandTotal: total, amountPaid: 0, balanceDue: total, status: "ISSUED", notes: req.notes ?? null, lines: { create: req.items.map((i: any) => ({ variantId: i.variantId ?? null, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate ?? 0, taxAmount: i.taxRate ? i.quantity * i.unitPrice * i.taxRate / 100 : 0, discountAmount: i.discountAmount ?? 0, lineTotal: i.quantity * i.unitPrice + (i.taxRate ? i.quantity * i.unitPrice * i.taxRate / 100 : 0) - (i.discountAmount ?? 0) })) } } }); }
  async createSupplierInvoice(ctx: TenantContext, req: any) { const s = await this.db.supplier.findUnique({ where: { id: req.supplierId } }); this.assertTenant(ctx, s); const subtotal = req.items.reduce((x: number, i: any) => x + i.quantity * i.unitCost, 0); const tax = req.items.reduce((x: number, i: any) => x + (i.taxRate ? i.quantity * i.unitCost * i.taxRate / 100 : 0), 0); const total = subtotal + tax; return this.db.supplierInvoice.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, supplierId: req.supplierId, purchaseReceiptId: req.purchaseReceiptId ?? null, invoiceNumber: req.invoiceNumber ?? `BIL-${Date.now()}`, invoiceDate: req.invoiceDate ? new Date(req.invoiceDate) : new Date(), dueDate: new Date(req.dueDate), subtotal, taxTotal: tax, grandTotal: total, amountPaid: 0, balanceDue: total, status: "APPROVED", notes: req.notes ?? null, lines: { create: req.items.map((i: any) => ({ variantId: i.variantId ?? null, description: i.description, quantity: i.quantity, unitCost: i.unitCost, taxRate: i.taxRate ?? 0, taxAmount: i.taxRate ? i.quantity * i.unitCost * i.taxRate / 100 : 0, lineTotal: i.quantity * i.unitCost + (i.taxRate ? i.quantity * i.unitCost * i.taxRate / 100 : 0) })) } } }); }
  async getBankAccounts(ctx: TenantContext) { return this.db.bankAccount.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { transactions: true } }); }
  async createBankAccount(ctx: TenantContext, req: any) { const dup = await this.db.bankAccount.findFirst({ where: { tenantId: ctx.tenantId, accountNumber: req.accountNumber } }); if (dup) throw new Error("FINANCE_BANK_ACCOUNT_EXISTS"); return this.db.bankAccount.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, accountName: req.accountName, bankName: req.bankName, accountNumber: req.accountNumber, currency: req.currency ?? "TZS", openingBalance: req.openingBalance ?? 0, currentBalance: req.openingBalance ?? 0, isActive: true } }); }
  async recordBankTransaction(ctx: TenantContext, bankAccountId: string, req: any) { return this.db.$transaction(async (tx: any) => { const bank = await tx.bankAccount.findUnique({ where: { id: bankAccountId } }); this.assertTenant(ctx, bank); const t = await tx.bankTransaction.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, bankAccountId, transactionDate: new Date(req.transactionDate ?? new Date()), transactionType: req.transactionType, amount: req.amount, reference: req.reference, description: req.description ?? null } }); await tx.bankAccount.update({ where: { id: bankAccountId }, data: { currentBalance: { increment: req.amount } } }); return t; }); }
  async getBudgets(ctx: TenantContext) { return this.db.budget.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true } }); }
  async createBudget(ctx: TenantContext, req: any) { for (const l of req.lines ?? []) { const a = await this.db.account.findUnique({ where: { id: l.accountId } }); this.assertTenant(ctx, a); } const total = (req.lines ?? []).reduce((s: number, l: any) => s + l.budgetedAmount, 0); return this.db.budget.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, name: req.name, fiscalYear: req.fiscalYear, period: req.period ?? null, totalBudget: total, status: "APPROVED", lines: { create: (req.lines ?? []).map((l: any) => ({ accountId: l.accountId, costCenterId: l.costCenterId ?? null, budgetedAmount: l.budgetedAmount, actualAmount: 0, varianceAmount: l.budgetedAmount })) } } }); }

  async getTrialBalance(ctx: TenantContext, asOfDate?: string) {
    const reportDate = asOfDate ? new Date(asOfDate) : new Date();
    const journals = await this.db.journalEntry.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, entryDate: { lte: reportDate }, status: "POSTED" }, include: { lines: true } });
    const accounts = await this.getAccounts(ctx);
    const lines = journals.flatMap((j: any) => j.lines);
    return FinancialReportingEngine.generateTrialBalance(ctx as any, accounts as any, journals as any, lines as any, reportDate as any) ?? { accounts: [], totals: { totalDebit: 0, totalCredit: 0 }, asOfDate: reportDate.toISOString() };
  }




  async getExecutiveDashboard(ctx: TenantContext) {
    const journals = await this.db.journalEntry.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: "POSTED" }, include: { lines: true } });
    const accounts = await this.getAccounts(ctx);
    const revenue = accounts.filter((a: any) => a.accountClass === "REVENUE");
    const expense = accounts.filter((a: any) => ["EXPENSE", "COGS"].includes(a.accountClass));
    const balance = (ids: Set<string>, debitPositive = true) => journals.flatMap((j: any) => j.lines).filter((l: any) => ids.has(l.accountId)).reduce((s: number, l: any) => s + (debitPositive ? num(l.debit) - num(l.credit) : num(l.credit) - num(l.debit)), 0);
    const rev = balance(new Set(revenue.map((a: any) => a.id)), false);
    const costs = balance(new Set(expense.map((a: any) => a.id)), true);
    const budgets = await this.getBudgets(ctx); const totalBudget = budgets.reduce((s: number, b: any) => s + num(b.totalBudget), 0);
    return { revenue: rev, cogs: 0, grossProfit: rev, grossMarginPct: rev ? 100 : 0, operatingExpenses: costs, netProfit: rev - costs, netMarginPct: rev ? ((rev - costs) / rev) * 100 : 0, cashPosition: 0, bankPosition: 0, accountsReceivable: 0, accountsPayable: 0, inventoryValue: 0, overdueReceivablesCount: (await this.getCustomerInvoices(ctx)).filter((i: any) => num(i.balanceDue) > 0 && new Date(i.dueDate) < new Date()).length, overduePayablesCount: (await this.getSupplierInvoices(ctx)).filter((i: any) => num(i.balanceDue) > 0 && new Date(i.dueDate) < new Date()).length, budgetVariancePct: totalBudget ? ((costs - totalBudget) / totalBudget) * 100 : 0, branchProfitability: [{ branchId: ctx.branchId, branchName: ctx.branchId, revenue: rev, grossProfit: rev, netProfit: rev - costs, marginPct: rev ? ((rev - costs) / rev) * 100 : 0 }] };
  }
}
