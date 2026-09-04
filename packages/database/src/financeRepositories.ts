import type {
  TenantContext,
  Account,
  FiscalYear,
  AccountingPeriod,
  JournalEntry,
  JournalLine,
  CustomerInvoice,
  SupplierInvoice,
  PaymentAllocation,
  BankAccount,
  BankTransaction,
  Budget,
  FinancialAnomaly,
  CreateAccountRequest,
  UpdateAccountRequest,
  CreateFiscalYearRequest,
  CreateAccountingPeriodRequest,
  CreateJournalEntryRequest,
  ReverseJournalEntryRequest,
  CreateCustomerInvoiceRequest,
  CreateSupplierInvoiceRequest,
  AllocatePaymentRequest,
  CreateBankAccountRequest,
  CreateBankTransactionRequest,
  CreateBudgetRequest,
  ProfitAndLossReport,
  BalanceSheetReport,
  TrialBalanceReport,
  AgingReport,
  ExecutiveFinancialDashboard,
} from "@kwakopos2/contracts";
import {
  assertJournalBalanced,
  assertJournalTenantIsolation,
  assertJournalSourceTraceability,
  assertPostedJournalImmutable,
  assertReversalReferencesOriginal,
  assertPeriodAllowsPosting,
  assertBranchFinancialBoundary,
  AccountingEngine,
  FinancialBridge,
  ReceivablesPayablesEngine,
  InventoryValuationEngine,
  FinancialReportingEngine,
  ProfitabilityEngine,
  BudgetEngine,
  AnomalyDetectionEngine,
  TransactionNumbering,
} from "@kwakopos2/domain";
import type { InMemoryStore } from "./index.js";
import { randomUUID } from "crypto";

export class ScopedFinanceRepository {
  private store: InMemoryStore;

  // In-Memory collections for Finance
  accounts: Map<string, Account> = new Map();
  fiscalYears: Map<string, FiscalYear> = new Map();
  accountingPeriods: Map<string, AccountingPeriod> = new Map();
  journalEntries: Map<string, JournalEntry> = new Map();
  journalLines: Map<string, JournalLine[]> = new Map();
  customerInvoices: Map<string, CustomerInvoice> = new Map();
  supplierInvoices: Map<string, SupplierInvoice> = new Map();
  paymentAllocations: Map<string, PaymentAllocation> = new Map();
  bankAccounts: Map<string, BankAccount> = new Map();
  bankTransactions: Map<string, BankTransaction> = new Map();
  budgets: Map<string, Budget> = new Map();
  financialAnomalies: Map<string, FinancialAnomaly> = new Map();

  constructor(store: InMemoryStore) {
    this.store = store;
  }

  // =========================================================================
  // Chart of Accounts Management
  // =========================================================================

  ensureDefaultAccounts(ctx: TenantContext): Account[] {
    const existing = this.getAccounts(ctx);
    if (existing.length > 0) return existing;

    const defaultAccounts = AccountingEngine.seedDefaultAccounts(ctx);
    for (const acc of defaultAccounts) {
      this.accounts.set(acc.id, acc);
    }
    return defaultAccounts;
  }

  getAccounts(ctx: TenantContext): Account[] {
    return Array.from(this.accounts.values()).filter((a) => a.tenantId === ctx.tenantId);
  }

  getAccountByCode(ctx: TenantContext, code: string): Account | null {
    return (
      Array.from(this.accounts.values()).find(
        (a) => a.tenantId === ctx.tenantId && a.accountCode === code
      ) || null
    );
  }

  getAccountLookup(ctx: TenantContext): {
    cashAccountId: string;
    bankAccountId: string;
    receivableAccountId: string;
    inventoryAccountId: string;
    payableAccountId: string;
    taxPayableAccountId: string;
    salesRevenueAccountId: string;
    salesDiscountAccountId: string;
    cogsAccountId: string;
    expenseDefaultAccountId: string;
    cashVarianceAccountId: string;
    salariesExpenseAccountId: string;
    payrollTaxesPayableAccountId: string;
    netSalariesPayableAccountId: string;
  } {
    this.ensureDefaultAccounts(ctx);
    const getCodeId = (code: string) => this.getAccountByCode(ctx, code)?.id || randomUUID();
    return {
      cashAccountId: getCodeId("1110"),
      bankAccountId: getCodeId("1210"),
      receivableAccountId: getCodeId("1310"),
      inventoryAccountId: getCodeId("1410"),
      payableAccountId: getCodeId("2110"),
      taxPayableAccountId: getCodeId("2210"),
      salesRevenueAccountId: getCodeId("4100"),
      salesDiscountAccountId: getCodeId("4900"),
      cogsAccountId: getCodeId("5100"),
      expenseDefaultAccountId: getCodeId("6900"),
      cashVarianceAccountId: getCodeId("8100"),
      salariesExpenseAccountId: getCodeId("6300"),
      payrollTaxesPayableAccountId: getCodeId("2410"),
      netSalariesPayableAccountId: getCodeId("2420"),
    };
  }

  createAccount(ctx: TenantContext, req: CreateAccountRequest): Account {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const account: Account = {
      id,
      tenantId: ctx.tenantId,
      branchId: req.branchId || ctx.branchId || null,
      accountCode: req.accountCode,
      name: req.name,
      accountClass: req.accountClass,
      accountGroup: req.accountGroup,
      currency: req.currency || "TZS",
      isSystem: false,
      isActive: true,
      currentBalance: 0,
      description: req.description || null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(id, account);
    return account;
  }

  updateAccount(ctx: TenantContext, id: string, req: UpdateAccountRequest): Account {
    const account = this.accounts.get(id);
    if (!account) throw new Error(`Account ${id} not found`);
    assertJournalTenantIsolation(ctx, { tenantId: account.tenantId });

    const updated: Account = {
      ...account,
      name: req.name ?? account.name,
      accountGroup: req.accountGroup ?? account.accountGroup,
      description: req.description !== undefined ? req.description : account.description,
      isActive: req.isActive ?? account.isActive,
      updatedAt: new Date().toISOString(),
    };
    this.accounts.set(id, updated);
    return updated;
  }

  // =========================================================================
  // Fiscal Years & Accounting Periods
  // =========================================================================

  createFiscalYear(ctx: TenantContext, req: CreateFiscalYearRequest): FiscalYear {
    const id = randomUUID();
    const now = new Date().toISOString();
    const fy: FiscalYear = {
      id,
      tenantId: ctx.tenantId,
      name: req.name,
      startDate: req.startDate,
      endDate: req.endDate,
      status: "OPEN",
      isClosed: false,
      closedAt: null,
      closedById: null,
      createdAt: now,
      updatedAt: now,
    };
    this.fiscalYears.set(id, fy);
    return fy;
  }

  getFiscalYears(ctx: TenantContext): FiscalYear[] {
    return Array.from(this.fiscalYears.values()).filter((fy) => fy.tenantId === ctx.tenantId);
  }

  createAccountingPeriod(ctx: TenantContext, req: CreateAccountingPeriodRequest): AccountingPeriod {
    const id = randomUUID();
    const now = new Date().toISOString();
    const period: AccountingPeriod = {
      id,
      tenantId: ctx.tenantId,
      fiscalYearId: req.fiscalYearId,
      periodNumber: req.periodNumber,
      name: req.name,
      startDate: req.startDate,
      endDate: req.endDate,
      status: "OPEN",
      closedAt: null,
      closedById: null,
      createdAt: now,
      updatedAt: now,
    };
    this.accountingPeriods.set(id, period);
    return period;
  }

  getAccountingPeriods(ctx: TenantContext): AccountingPeriod[] {
    return Array.from(this.accountingPeriods.values()).filter((p) => p.tenantId === ctx.tenantId);
  }

  closePeriod(ctx: TenantContext, periodId: string): AccountingPeriod {
    const period = this.accountingPeriods.get(periodId);
    if (!period) throw new Error(`Period ${periodId} not found`);
    assertJournalTenantIsolation(ctx, { tenantId: period.tenantId });

    period.status = "CLOSED";
    period.closedAt = new Date().toISOString();
    period.closedById = ctx.userId;
    period.updatedAt = new Date().toISOString();
    return period;
  }

  reopenPeriod(ctx: TenantContext, periodId: string): AccountingPeriod {
    const period = this.accountingPeriods.get(periodId);
    if (!period) throw new Error(`Period ${periodId} not found`);
    assertJournalTenantIsolation(ctx, { tenantId: period.tenantId });

    period.status = "OPEN";
    period.closedAt = null;
    period.closedById = null;
    period.updatedAt = new Date().toISOString();
    return period;
  }

  // =========================================================================
  // Double-Entry Journals & Reversals
  // =========================================================================

  createJournalEntry(ctx: TenantContext, req: CreateJournalEntryRequest): { journal: JournalEntry; lines: JournalLine[] } {
    // Idempotency check
    if (req.idempotencyKey) {
      const existing = Array.from(this.journalEntries.values()).find(
        (j) => j.tenantId === ctx.tenantId && j.idempotencyKey === req.idempotencyKey
      );
      if (existing) {
        const existingLines = this.journalLines.get(existing.id) || [];
        return { journal: existing, lines: existingLines };
      }
    }

    // Accounting Period Validation (Invariant F010)
    if (req.accountingPeriodId) {
      const period = this.accountingPeriods.get(req.accountingPeriodId);
      assertPeriodAllowsPosting(period);
    }

    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", this.journalEntries.size + 1);
    const { journal, lines } = AccountingEngine.createJournalEntry(ctx, {
      id: req.id,
      journalNumber,
      accountingPeriodId: req.accountingPeriodId,
      entryDate: req.entryDate,
      sourceType: req.sourceType,
      sourceId: req.sourceId,
      description: req.description,
      currency: req.currency,
      exchangeRate: req.exchangeRate,
      idempotencyKey: req.idempotencyKey,
      lines: req.lines,
    });

    assertJournalSourceTraceability(journal);
    assertJournalTenantIsolation(ctx, { tenantId: journal.tenantId, branchId: journal.branchId });

    this.journalEntries.set(journal.id, journal);
    this.journalLines.set(journal.id, lines);

    return { journal, lines };
  }

  getJournals(ctx: TenantContext): JournalEntry[] {
    return Array.from(this.journalEntries.values()).filter(
      (j) => j.tenantId === ctx.tenantId && j.branchId === ctx.branchId
    );
  }

  getJournalById(ctx: TenantContext, id: string): { journal: JournalEntry; lines: JournalLine[] } | null {
    const journal = this.journalEntries.get(id);
    if (!journal) return null;
    assertJournalTenantIsolation(ctx, { tenantId: journal.tenantId, branchId: journal.branchId });
    const lines = this.journalLines.get(id) || [];
    return { journal, lines };
  }

  reverseJournalEntry(ctx: TenantContext, id: string, req: ReverseJournalEntryRequest): { reversalJournal: JournalEntry; reversalLines: JournalLine[] } {
    const entry = this.getJournalById(ctx, id);
    if (!entry) throw new Error(`Journal ${id} not found`);

    const reversalNumber = TransactionNumbering.formatNumber("REV", "MAIN", this.journalEntries.size + 1);
    const { reversalJournal, reversalLines } = AccountingEngine.createReversalJournal(
      ctx,
      entry.journal,
      entry.lines,
      req.reason,
      reversalNumber
    );

    assertReversalReferencesOriginal(reversalJournal, true);

    // Mark original as REVERSED
    entry.journal.status = "REVERSED";
    entry.journal.updatedAt = new Date().toISOString();

    this.journalEntries.set(reversalJournal.id, reversalJournal);
    this.journalLines.set(reversalJournal.id, reversalLines);

    return { reversalJournal, reversalLines };
  }

  // =========================================================================
  // Accounts Receivable (Customer Invoices & Aging)
  // =========================================================================

  createCustomerInvoice(ctx: TenantContext, req: CreateCustomerInvoiceRequest): CustomerInvoice {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const invoiceNumber = TransactionNumbering.formatNumber("INV", "MAIN", this.customerInvoices.size + 1);

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const lines = req.items.map((item) => {
      const lineTax = item.taxRate ? (item.quantity * item.unitPrice * item.taxRate) / 100 : 0;
      const lineDiscount = item.discountAmount || 0;
      const lineTotal = item.quantity * item.unitPrice + lineTax - lineDiscount;

      subtotal += item.quantity * item.unitPrice;
      taxTotal += lineTax;
      discountTotal += lineDiscount;

      return {
        id: randomUUID(),
        customerInvoiceId: id,
        variantId: item.variantId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || 0,
        taxAmount: lineTax,
        discountAmount: lineDiscount,
        lineTotal,
      };
    });

    const grandTotal = subtotal + taxTotal - discountTotal;

    const invoice: CustomerInvoice = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: req.customerId,
      saleId: req.saleId || null,
      invoiceNumber,
      invoiceDate: req.invoiceDate || now,
      dueDate: req.dueDate,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      amountPaid: 0,
      balanceDue: Math.round(grandTotal * 100) / 100,
      status: "ISSUED",
      notes: req.notes || null,
      lines,
      createdAt: now,
      updatedAt: now,
    };

    this.customerInvoices.set(id, invoice);
    return invoice;
  }

  getCustomerInvoices(ctx: TenantContext): CustomerInvoice[] {
    return Array.from(this.customerInvoices.values()).filter(
      (inv) => inv.tenantId === ctx.tenantId && inv.branchId === ctx.branchId
    );
  }

  getReceivablesAging(ctx: TenantContext): AgingReport {
    const customers = Array.from(this.store.tenants.values()); // Use commercial customer store
    const invoices = this.getCustomerInvoices(ctx);
    return ReceivablesPayablesEngine.generateReceivablesAgingReport(ctx, customers as any, invoices);
  }

  // =========================================================================
  // Accounts Payable (Supplier Invoices & Aging)
  // =========================================================================

  createSupplierInvoice(ctx: TenantContext, req: CreateSupplierInvoiceRequest): SupplierInvoice {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const invoiceNumber = req.invoiceNumber || TransactionNumbering.formatNumber("BIL", "MAIN", this.supplierInvoices.size + 1);

    let subtotal = 0;
    let taxTotal = 0;

    const lines = req.items.map((item) => {
      const lineTax = item.taxRate ? (item.quantity * item.unitCost * item.taxRate) / 100 : 0;
      const lineTotal = item.quantity * item.unitCost + lineTax;

      subtotal += item.quantity * item.unitCost;
      taxTotal += lineTax;

      return {
        id: randomUUID(),
        supplierInvoiceId: id,
        variantId: item.variantId || null,
        description: item.description,
        quantity: item.quantity,
        unitCost: item.unitCost,
        taxRate: item.taxRate || 0,
        taxAmount: lineTax,
        lineTotal,
      };
    });

    const grandTotal = subtotal + taxTotal;

    const invoice: SupplierInvoice = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      supplierId: req.supplierId,
      purchaseReceiptId: req.purchaseReceiptId || null,
      invoiceNumber,
      invoiceDate: req.invoiceDate || now,
      dueDate: req.dueDate,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      amountPaid: 0,
      balanceDue: Math.round(grandTotal * 100) / 100,
      status: "APPROVED",
      notes: req.notes || null,
      lines,
      createdAt: now,
      updatedAt: now,
    };

    this.supplierInvoices.set(id, invoice);
    return invoice;
  }

  getSupplierInvoices(ctx: TenantContext): SupplierInvoice[] {
    return Array.from(this.supplierInvoices.values()).filter(
      (inv) => inv.tenantId === ctx.tenantId && inv.branchId === ctx.branchId
    );
  }

  getPayablesAging(ctx: TenantContext): AgingReport {
    const suppliers = Array.from(this.store.tenants.values());
    const invoices = this.getSupplierInvoices(ctx);
    return ReceivablesPayablesEngine.generatePayablesAgingReport(ctx, suppliers as any, invoices);
  }

  // =========================================================================
  // Payment Allocation
  // =========================================================================

  allocatePayment(ctx: TenantContext, req: AllocatePaymentRequest): { updatedInvoice: CustomerInvoice | SupplierInvoice; allocation: PaymentAllocation } {
    let invoice: CustomerInvoice | SupplierInvoice | undefined;

    if (req.customerInvoiceId) {
      invoice = this.customerInvoices.get(req.customerInvoiceId);
    } else if (req.supplierInvoiceId) {
      invoice = this.supplierInvoices.get(req.supplierInvoiceId);
    }

    if (!invoice) throw new Error("Target invoice not found for payment allocation");
    assertJournalTenantIsolation(ctx, { tenantId: invoice.tenantId, branchId: invoice.branchId });

    const result = ReceivablesPayablesEngine.allocatePayment(ctx, {
      paymentId: req.paymentId,
      invoice,
      amountToAllocate: req.amount,
    });

    if (req.customerInvoiceId) {
      this.customerInvoices.set(req.customerInvoiceId, result.updatedInvoice as CustomerInvoice);
    } else if (req.supplierInvoiceId) {
      this.supplierInvoices.set(req.supplierInvoiceId, result.updatedInvoice as SupplierInvoice);
    }

    this.paymentAllocations.set(result.allocation.id, result.allocation);
    return { updatedInvoice: result.updatedInvoice, allocation: result.allocation };
  }

  // =========================================================================
  // Bank Accounts & Transactions
  // =========================================================================

  createBankAccount(ctx: TenantContext, req: CreateBankAccountRequest): BankAccount {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const bankAccount: BankAccount = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      accountName: req.accountName,
      bankName: req.bankName,
      accountNumber: req.accountNumber,
      currency: req.currency || "TZS",
      openingBalance: req.openingBalance || 0,
      currentBalance: req.openingBalance || 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.bankAccounts.set(id, bankAccount);
    return bankAccount;
  }

  getBankAccounts(ctx: TenantContext): BankAccount[] {
    return Array.from(this.bankAccounts.values()).filter(
      (b) => b.tenantId === ctx.tenantId && b.branchId === ctx.branchId
    );
  }

  recordBankTransaction(ctx: TenantContext, bankAccountId: string, req: CreateBankTransactionRequest): BankTransaction {
    const bank = this.bankAccounts.get(bankAccountId);
    if (!bank) throw new Error(`Bank account ${bankAccountId} not found`);
    assertJournalTenantIsolation(ctx, { tenantId: bank.tenantId, branchId: bank.branchId });

    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const tx: BankTransaction = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      bankAccountId,
      transactionDate: req.transactionDate || now,
      transactionType: req.transactionType,
      amount: req.amount,
      reference: req.reference,
      description: req.description || null,
      reconciled: false,
      reconciledAt: null,
      matchedJournalLineId: null,
      createdAt: now,
    };

    bank.currentBalance += req.amount;
    bank.updatedAt = now;

    this.bankTransactions.set(id, tx);
    return tx;
  }

  // =========================================================================
  // Budgets
  // =========================================================================

  createBudget(ctx: TenantContext, req: CreateBudgetRequest): Budget {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    let totalBudget = 0;

    const lines = req.lines.map((l) => {
      totalBudget += l.budgetedAmount;
      return {
        id: randomUUID(),
        budgetId: id,
        accountId: l.accountId,
        costCenterId: l.costCenterId || null,
        budgetedAmount: l.budgetedAmount,
        actualAmount: 0,
        varianceAmount: l.budgetedAmount,
      };
    });

    const budget: Budget = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: req.name,
      fiscalYear: req.fiscalYear,
      period: req.period || null,
      totalBudget,
      status: "APPROVED",
      lines,
      createdAt: now,
      updatedAt: now,
    };

    this.budgets.set(id, budget);
    return budget;
  }

  getBudgets(ctx: TenantContext): Budget[] {
    return Array.from(this.budgets.values()).filter(
      (b) => b.tenantId === ctx.tenantId && b.branchId === ctx.branchId
    );
  }

  getBudgetVsActual(ctx: TenantContext, budgetId: string) {
    const budget = this.budgets.get(budgetId);
    if (!budget) throw new Error(`Budget ${budgetId} not found`);

    const accounts = this.getAccounts(ctx);
    const journals = this.getJournals(ctx);
    const allLines = Array.from(this.journalLines.values()).flat();

    const actualExpenseMap = new Map<string, number>();
    for (const acc of accounts) {
      const accLines = allLines.filter((l) => l.accountId === acc.id);
      const totalDebit = accLines.reduce((sum, l) => sum + Number(l.debit), 0);
      actualExpenseMap.set(acc.id, totalDebit);
    }

    return BudgetEngine.calculateBudgetVariance(budget, budget.lines || [], actualExpenseMap);
  }

  // =========================================================================
  // Financial Reporting & Dashboards
  // =========================================================================

  getTrialBalance(ctx: TenantContext, asOfDate?: string): TrialBalanceReport {
    this.ensureDefaultAccounts(ctx);
    const accounts = this.getAccounts(ctx);
    const journals = this.getJournals(ctx);
    const lines = Array.from(this.journalLines.values()).flat();
    return FinancialReportingEngine.generateTrialBalance(ctx, accounts, journals, lines, asOfDate);
  }

  getProfitAndLoss(ctx: TenantContext, startDate?: string, endDate?: string): ProfitAndLossReport {
    this.ensureDefaultAccounts(ctx);
    const accounts = this.getAccounts(ctx);
    const journals = this.getJournals(ctx);
    const lines = Array.from(this.journalLines.values()).flat();
    return FinancialReportingEngine.generateProfitAndLoss(ctx, accounts, journals, lines, "Standard", startDate, endDate);
  }

  getBalanceSheet(ctx: TenantContext, asOfDate?: string): BalanceSheetReport {
    this.ensureDefaultAccounts(ctx);
    const accounts = this.getAccounts(ctx);
    const journals = this.getJournals(ctx);
    const lines = Array.from(this.journalLines.values()).flat();
    return FinancialReportingEngine.generateBalanceSheet(ctx, accounts, journals, lines, asOfDate);
  }

  getExecutiveDashboard(ctx: TenantContext): ExecutiveFinancialDashboard {
    const pnl = this.getProfitAndLoss(ctx);
    const bs = this.getBalanceSheet(ctx);

    const now = Date.now();
    const overdueReceivables = this.getCustomerInvoices(ctx).filter(
      (i) => Number(i.balanceDue) > 0 && new Date(i.dueDate).getTime() < now
    );
    const overduePayables = this.getSupplierInvoices(ctx).filter(
      (i) => Number(i.balanceDue) > 0 && new Date(i.dueDate).getTime() < now
    );

    const branch = { id: ctx.branchId, name: "Main Branch" };
    const branchScorecard = ProfitabilityEngine.generateBranchScorecard(branch, [], []);

    return {
      revenue: pnl.revenue.totalRevenue,
      cogs: pnl.costOfGoodsSold.totalCogs,
      grossProfit: pnl.grossProfit,
      grossMarginPct: pnl.grossMarginPct,
      operatingExpenses: pnl.operatingExpenses.totalOperatingExpenses,
      netProfit: pnl.netProfit,
      netMarginPct: pnl.netMarginPct,
      cashPosition: bs.assets.cashOnHand,
      bankPosition: bs.assets.bankBalances,
      accountsReceivable: bs.assets.accountsReceivable,
      accountsPayable: bs.liabilities.accountsPayable,
      inventoryValue: bs.assets.inventoryValuation,
      overdueReceivablesCount: overdueReceivables.length,
      overduePayablesCount: overduePayables.length,
      budgetVariancePct: 0,
      branchProfitability: [
        {
          branchId: branch.id,
          branchName: branch.name,
          revenue: branchScorecard.revenue || pnl.revenue.totalRevenue,
          grossProfit: branchScorecard.grossProfit || pnl.grossProfit,
          netProfit: branchScorecard.netProfit || pnl.netProfit,
          marginPct: branchScorecard.netMarginPct || pnl.netMarginPct,
        },
      ],
    };
  }

  // =========================================================================
  // Commercial-to-Finance Automated Bridge Helpers
  // =========================================================================

  bridgeCommercialSale(
    ctx: TenantContext,
    sale: any,
    tenderMethod: "CASH" | "BANK" | "CREDIT" | "MOBILE_MONEY" = "CASH"
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const lookup = this.getAccountLookup(ctx);
    const { journal, lines } = FinancialBridge.mapSaleToJournal(ctx, sale, lookup, tenderMethod);
    this.journalEntries.set(journal.id, journal);
    this.journalLines.set(journal.id, lines);
    return { journal, lines };
  }

  bridgePurchaseReceipt(
    ctx: TenantContext,
    receipt: any
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const lookup = this.getAccountLookup(ctx);
    const { journal, lines } = FinancialBridge.mapGoodsReceiptToJournal(ctx, receipt, lookup);
    this.journalEntries.set(journal.id, journal);
    this.journalLines.set(journal.id, lines);
    return { journal, lines };
  }

  bridgeExpense(
    ctx: TenantContext,
    expense: any,
    expenseAccountId?: string
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const lookup = this.getAccountLookup(ctx);
    const targetAccountId = expenseAccountId || lookup.expenseDefaultAccountId;
    const { journal, lines } = FinancialBridge.mapExpenseToJournal(ctx, expense, targetAccountId, lookup);
    this.journalEntries.set(journal.id, journal);
    this.journalLines.set(journal.id, lines);
    return { journal, lines };
  }

  // =========================================================================
  // Financial Anomalies
  // =========================================================================

  recordAnomaly(ctx: TenantContext, anomaly: FinancialAnomaly): FinancialAnomaly {
    this.financialAnomalies.set(anomaly.id, anomaly);
    return anomaly;
  }

  getAnomalies(ctx: TenantContext): FinancialAnomaly[] {
    return Array.from(this.financialAnomalies.values()).filter(
      (a) => a.tenantId === ctx.tenantId && a.branchId === ctx.branchId
    );
  }
}

