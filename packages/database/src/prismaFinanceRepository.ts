import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { randomUUID } from "node:crypto";
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
    const seed = AccountingEngine.seedDefaultAccounts(ctx) as any[];
    await this.db.account.createMany({
      data: seed.map((a) => ({ id: a.id, tenantId: ctx.tenantId, branchId: a.branchId ?? ctx.branchId, accountCode: a.accountCode, name: a.name, accountClass: a.accountClass, accountGroup: a.accountGroup, currency: a.currency ?? "TZS", isSystem: true, isActive: true, currentBalance: 0, description: a.description ?? null })),
      skipDuplicates: true,
    });
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
  async closePeriod(ctx: TenantContext, id: string) { const p = await this.db.accountingPeriod.findUnique({ where: { id } }); this.assertTenant(ctx, p, false); if (p.status === "CLOSED" || p.status === "LOCKED") throw new Error("FINANCE_PERIOD_ALREADY_CLOSED"); return this.db.$transaction(async (tx: any) => { const closed = await tx.accountingPeriod.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, isClosed: true } }); await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "ACCOUNTING_PERIOD_CLOSED", entityType: "AccountingPeriod", entityId: id, metadata: { previousStatus: p.status, newStatus: "CLOSED" } } }); return closed; }); }
  async reopenPeriod(ctx: TenantContext, id: string) { const p = await this.db.accountingPeriod.findUnique({ where: { id } }); this.assertTenant(ctx, p, false); return this.db.$transaction(async (tx: any) => { const reopened = await tx.accountingPeriod.update({ where: { id }, data: { status: "OPEN", isClosed: false, closedAt: null, closedById: null } }); await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "ACCOUNTING_PERIOD_REOPENED", entityType: "AccountingPeriod", entityId: id, metadata: { previousStatus: p.status, newStatus: "OPEN" } } }); return reopened; }); }

  async getJournals(ctx: TenantContext) { return this.db.journalEntry.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true }, orderBy: { entryDate: "desc" } }); }
  async getJournalById(ctx: TenantContext, id: string) { const j = await this.db.journalEntry.findUnique({ where: { id }, include: { lines: true } }); if (!j) return null; this.assertTenant(ctx, j); return { journal: j, lines: j.lines }; }

  async createJournalEntry(ctx: TenantContext, req: any) {
    if (req.idempotencyKey) { const existing = await this.db.journalEntry.findUnique({ where: { idempotencyKey: req.idempotencyKey }, include: { lines: true } }); if (existing) { this.assertTenant(ctx, existing); return { journal: existing, lines: existing.lines }; } }
    if (req.accountingPeriodId) { const p = await this.db.accountingPeriod.findUnique({ where: { id: req.accountingPeriodId } }); if (!p) throw new Error("FINANCE_PERIOD_NOT_FOUND"); if (p.tenantId !== ctx.tenantId) throw new Error("FINANCE_TENANT_BOUNDARY_VIOLATION"); if (["CLOSING", "CLOSED", "LOCKED"].includes(p.status)) throw new Error("INVARIANT_F010_VIOLATION"); }
    const built = AccountingEngine.createJournalEntry(ctx, { ...req, journalNumber: req.journalNumber ?? `JRN-FIN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}` });
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
    if (original.journal.accountingPeriodId) { const period = await this.db.accountingPeriod.findUnique({ where: { id: original.journal.accountingPeriodId } }); if (period && ["CLOSING","CLOSED","LOCKED"].includes(period.status)) throw new Error("INVARIANT_F010_VIOLATION"); }
    const built = AccountingEngine.createReversalJournal(ctx, original.journal as any, original.lines as any, req.reason, `REV-FIN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`);
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
  private async requireFinanceAccount(tx: any, ctx: TenantContext, code: string) {
    const account = await tx.account.findFirst({ where: { tenantId: ctx.tenantId, accountCode: code, OR: [{ branchId: ctx.branchId }, { branchId: null }], isActive: true } });
    if (!account) throw new Error(`FINANCE_ACCOUNT_REQUIRED:${code}`);
    return account;
  }

  private async persistFinancialJournal(tx: any, ctx: TenantContext, input: any) {
    if (input.idempotencyKey) {
      const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } });
      if (existing) return { journal: existing, lines: existing.lines };
    }
    const totals = input.lines.reduce((a: any, l: any) => { a.debit += Number(l.debit || 0); a.credit += Number(l.credit || 0); return a; }, { debit: 0, credit: 0 });
    if (Math.abs(totals.debit - totals.credit) > 0.01 || input.lines.length < 2) throw new Error("INVARIANT_F001_VIOLATION");
    for (const line of input.lines) {
      const account = await tx.account.findUnique({ where: { id: line.accountId } });
      this.assertTenant(ctx, account, true);
      if (!account.isActive) throw new Error("FINANCE_ACCOUNT_INACTIVE");
      const debit = Number(line.debit || 0), credit = Number(line.credit || 0);
      if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) throw new Error("INVARIANT_F013_VIOLATION");
    }
    const id = randomUUID();
    const entryDate = new Date(input.entryDate || new Date());
    const journal = await tx.journalEntry.create({ data: {
      id, tenantId: ctx.tenantId, branchId: ctx.branchId,
      accountingPeriodId: input.accountingPeriodId ?? null,
      journalNumber: input.journalNumber || `JRN-FIN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      entryDate, postingDate: new Date(), sourceType: input.sourceType, sourceId: input.sourceId ?? null,
      description: input.description, currency: input.currency || "TZS", exchangeRate: input.exchangeRate || 1,
      totalDebit: totals.debit, totalCredit: totals.credit, status: "POSTED", isReversal: input.isReversal ?? false,
      reversalOfJournalId: input.reversalOfJournalId ?? null, reversalReason: input.reversalReason ?? null,
      createdById: ctx.userId, postedById: ctx.userId, postedAt: new Date(),
      idempotencyKey: input.idempotencyKey ?? `jrn-${id}`,
    }});
    const lines = await Promise.all(input.lines.map((l: any) => tx.journalLine.create({ data: {
      id: randomUUID(), journalEntryId: id, accountId: l.accountId, costCenterId: l.costCenterId ?? null,
      description: l.description ?? input.description, debit: Number(l.debit || 0), credit: Number(l.credit || 0),
      currency: input.currency || "TZS", exchangeRate: input.exchangeRate || 1,
    }})));
    await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "JOURNAL_POSTED", entityType: "JournalEntry", entityId: id, metadata: { sourceType: input.sourceType, sourceId: input.sourceId ?? null, journalNumber: journal.journalNumber, totalDebit: totals.debit, totalCredit: totals.credit } } });
    return { journal, lines };
  }

  async getCustomerInvoices(ctx: TenantContext) { return this.db.customerInvoice.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true, allocations: true }, orderBy: { invoiceDate: "desc" } }); }
  async getSupplierInvoices(ctx: TenantContext) { return this.db.supplierInvoice.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true, allocations: true }, orderBy: { invoiceDate: "desc" } }); }

  async createCustomerInvoice(ctx: TenantContext, req: any) {
    await this.ensureDefaultAccounts(ctx);
    const c = await this.db.customer.findFirst({ where: { id: req.customerId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!c) throw new Error("CUSTOMER_NOT_FOUND");
    const subtotal = req.items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
    const tax = req.items.reduce((s: number, i: any) => s + (i.taxRate ? i.quantity * i.unitPrice * i.taxRate / 100 : 0), 0);
    const discount = req.items.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
    const total = subtotal + tax - discount;
    const invoiceDate = req.invoiceDate ? new Date(req.invoiceDate) : new Date();
    return this.db.$transaction(async (tx: any) => {
      const invoiceId = req.id || randomUUID();
      const invoice = await tx.customerInvoice.create({ data: { id: invoiceId, tenantId: ctx.tenantId, branchId: ctx.branchId, customerId: req.customerId, saleId: req.saleId ?? null, invoiceNumber: req.invoiceNumber ?? `INV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`, invoiceDate, dueDate: new Date(req.dueDate), subtotal, taxTotal: tax, discountTotal: discount, grandTotal: total, amountPaid: 0, balanceDue: total, status: "ISSUED", notes: req.notes ?? null, lines: { create: req.items.map((i: any) => ({ variantId: i.variantId ?? null, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate ?? 0, taxAmount: i.taxRate ? i.quantity * i.unitPrice * i.taxRate / 100 : 0, discountAmount: i.discountAmount ?? 0, lineTotal: i.quantity * i.unitPrice + (i.taxRate ? i.quantity * i.unitPrice * i.taxRate / 100 : 0) - (i.discountAmount ?? 0) })) } }});
      const ar = await this.requireFinanceAccount(tx, ctx, "1310");
      const revenue = await this.requireFinanceAccount(tx, ctx, "4100");
      const taxAccount = tax > 0 ? await this.requireFinanceAccount(tx, ctx, "2210") : null;
      const lines = [{ accountId: ar.id, debit: total, credit: 0 }, { accountId: revenue.id, debit: 0, credit: Math.max(0, subtotal - discount) }];
      if (taxAccount && tax > 0) lines.push({ accountId: taxAccount.id, debit: 0, credit: tax });
      await this.persistFinancialJournal(tx, ctx, { sourceType: "SALE", sourceId: invoice.id, description: `Customer invoice ${invoice.invoiceNumber}`, entryDate: invoiceDate, lines, idempotencyKey: `ar-invoice-${invoice.id}` });
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "CUSTOMER_INVOICE_POSTED", entityType: "CustomerInvoice", entityId: invoice.id, metadata: { invoiceNumber: invoice.invoiceNumber, grandTotal: total, journalSource: "SALE" } } });
      return invoice;
    });
  }

  async createSupplierInvoice(ctx: TenantContext, req: any) {
    await this.ensureDefaultAccounts(ctx);
    const s = await this.db.supplier.findFirst({ where: { id: req.supplierId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!s) throw new Error("SUPPLIER_NOT_FOUND");
    const subtotal = req.items.reduce((x: number, i: any) => x + i.quantity * i.unitCost, 0);
    const tax = req.items.reduce((x: number, i: any) => x + (i.taxRate ? i.quantity * i.unitCost * i.taxRate / 100 : 0), 0);
    const total = subtotal + tax;
    const invoiceDate = req.invoiceDate ? new Date(req.invoiceDate) : new Date();
    return this.db.$transaction(async (tx: any) => {
      const invoiceId = req.id || randomUUID();
      const invoice = await tx.supplierInvoice.create({ data: { id: invoiceId, tenantId: ctx.tenantId, branchId: ctx.branchId, supplierId: req.supplierId, purchaseReceiptId: req.purchaseReceiptId ?? null, invoiceNumber: req.invoiceNumber ?? `BIL-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`, invoiceDate, dueDate: new Date(req.dueDate), subtotal, taxTotal: tax, grandTotal: total, amountPaid: 0, balanceDue: total, status: "APPROVED", notes: req.notes ?? null, lines: { create: req.items.map((i: any) => ({ variantId: i.variantId ?? null, description: i.description, quantity: i.quantity, unitCost: i.unitCost, taxRate: i.taxRate ?? 0, taxAmount: i.taxRate ? i.quantity * i.unitCost * i.taxRate / 100 : 0, lineTotal: i.quantity * i.unitCost + (i.taxRate ? i.quantity * i.unitCost * i.taxRate / 100 : 0) })) } }});
      const inventory = await this.requireFinanceAccount(tx, ctx, "1410");
      const ap = await this.requireFinanceAccount(tx, ctx, "2110");
      const inputTax = tax > 0 ? await this.requireFinanceAccount(tx, ctx, "2220") : null;
      const lines = [{ accountId: inventory.id, debit: subtotal, credit: 0 }];
      if (inputTax && tax > 0) lines.push({ accountId: inputTax.id, debit: tax, credit: 0 });
      lines.push({ accountId: ap.id, debit: 0, credit: total });
      await this.persistFinancialJournal(tx, ctx, { sourceType: "PURCHASE", sourceId: invoice.id, description: `Supplier invoice ${invoice.invoiceNumber}`, entryDate: invoiceDate, lines, idempotencyKey: `ap-invoice-${invoice.id}` });
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "SUPPLIER_INVOICE_POSTED", entityType: "SupplierInvoice", entityId: invoice.id, metadata: { invoiceNumber: invoice.invoiceNumber, grandTotal: total, journalSource: "PURCHASE" } } });
      return invoice;
    });
  }

  async getBankAccounts(ctx: TenantContext) { return this.db.bankAccount.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { transactions: true } }); }
  async createBankAccount(ctx: TenantContext, req: any) { const dup = await this.db.bankAccount.findFirst({ where: { tenantId: ctx.tenantId, accountNumber: req.accountNumber } }); if (dup) throw new Error("FINANCE_BANK_ACCOUNT_EXISTS"); return this.db.bankAccount.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, accountName: req.accountName, bankName: req.bankName, accountNumber: req.accountNumber, currency: req.currency ?? "TZS", openingBalance: req.openingBalance ?? 0, currentBalance: req.openingBalance ?? 0, isActive: true } }); }
  async recordBankTransaction(ctx: TenantContext, bankAccountId: string, req: any) {
    await this.ensureDefaultAccounts(ctx);
    return this.db.$transaction(async (tx: any) => {
      const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!bank) throw new Error("FINANCE_BANK_ACCOUNT_NOT_FOUND");
      const amount = Number(req.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("FINANCE_INVALID_BANK_AMOUNT");
      const type = String(req.transactionType);
      const debitBank = ["DEPOSIT","TRANSFER_IN","INTEREST"].includes(type);
      const offsetCode = req.offsetAccountCode || (type === "INTEREST" ? "7100" : type === "FEE" ? "8200" : type === "WITHDRAWAL" ? "1110" : type === "DEPOSIT" ? "1110" : "");
      if (!offsetCode && !req.offsetAccountId) throw new Error("FINANCE_BANK_OFFSET_ACCOUNT_REQUIRED");
      const bankAccount = await this.requireFinanceAccount(tx, ctx, "1210");
      const offset = req.offsetAccountId ? await tx.account.findUnique({ where: { id: req.offsetAccountId } }) : await this.requireFinanceAccount(tx, ctx, offsetCode);
      this.assertTenant(ctx, offset, true);
      const transactionId = req.id || randomUUID();
      const signed = debitBank ? amount : -amount;
      const row = await tx.bankTransaction.create({ data: { id: transactionId, tenantId: ctx.tenantId, branchId: ctx.branchId, bankAccountId, transactionDate: new Date(req.transactionDate ?? new Date()), transactionType: type, amount, reference: req.reference, description: req.description ?? null } });
      await tx.bankAccount.update({ where: { id: bankAccountId }, data: { currentBalance: { increment: signed } } });
      const lines = debitBank
        ? [{ accountId: bankAccount.id, debit: amount, credit: 0 }, { accountId: offset.id, debit: 0, credit: amount }]
        : [{ accountId: offset.id, debit: amount, credit: 0 }, { accountId: bankAccount.id, debit: 0, credit: amount }];
      await this.persistFinancialJournal(tx, ctx, { sourceType: "PAYMENT", sourceId: row.id, description: `Bank ${type} ${row.reference}`, entryDate: row.transactionDate, lines, idempotencyKey: `bank-tx-${row.id}` });
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "BANK_TRANSACTION_POSTED", entityType: "BankTransaction", entityId: row.id, metadata: { bankAccountId, transactionType: type, amount, reference: row.reference } } });
      return row;
    });
  }

  async allocatePayment(ctx: TenantContext, req: any) {
    await this.ensureDefaultAccounts(ctx);
    return this.db.$transaction(async (tx: any) => {
      const payment = await tx.payment.findFirst({ where: { id: req.paymentId, tenantId: ctx.tenantId, branchId: ctx.branchId, status: { not: "FAILED" } } });
      if (!payment) throw new Error("FINANCE_PAYMENT_NOT_FOUND");
      const invoiceId = req.customerInvoiceId || req.supplierInvoiceId;
      if (!invoiceId || (!!req.customerInvoiceId && !!req.supplierInvoiceId)) throw new Error("FINANCE_SINGLE_INVOICE_REQUIRED");
      const invoice = req.customerInvoiceId
        ? await tx.customerInvoice.findFirst({ where: { id: invoiceId, tenantId: ctx.tenantId, branchId: ctx.branchId } })
        : await tx.supplierInvoice.findFirst({ where: { id: invoiceId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!invoice) throw new Error("FINANCE_INVOICE_NOT_FOUND");
      const amount = Number(req.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > Number(invoice.balanceDue) + 0.01) throw new Error("FINANCE_INVALID_ALLOCATION");
      const existing = await tx.paymentAllocation.aggregate({ where: { paymentId: payment.id }, _sum: { allocatedAmount: true } });
      if (Number(existing._sum.allocatedAmount || 0) + amount > Number(payment.amount) + 0.01) throw new Error("FINANCE_PAYMENT_OVERALLOCATED");
      const allocation = await tx.paymentAllocation.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, paymentId: payment.id, customerInvoiceId: req.customerInvoiceId ?? null, supplierInvoiceId: req.supplierInvoiceId ?? null, allocatedAmount: amount, createdById: ctx.userId } });
      const remaining = Number(invoice.balanceDue) - amount;
      const updated = req.customerInvoiceId
        ? await tx.customerInvoice.update({ where: { id: invoice.id }, data: { amountPaid: { increment: amount }, balanceDue: Math.max(0, remaining), status: remaining <= 0.01 ? "PAID" : "PARTIALLY_PAID" } })
        : await tx.supplierInvoice.update({ where: { id: invoice.id }, data: { amountPaid: { increment: amount }, balanceDue: Math.max(0, remaining), status: remaining <= 0.01 ? "PAID" : "PARTIALLY_PAID" } });
      const cashAccount = await this.requireFinanceAccount(tx, ctx, payment.paymentMethod === "BANK" ? "1210" : "1110");
      const arAp = await this.requireFinanceAccount(tx, ctx, req.customerInvoiceId ? "1310" : "2110");
      await this.persistFinancialJournal(tx, ctx, req.customerInvoiceId
        ? { sourceType: "PAYMENT", sourceId: payment.id, description: `AR payment allocation ${payment.paymentNumber}`, entryDate: payment.paidAt, lines: [{ accountId: cashAccount.id, debit: amount, credit: 0 }, { accountId: arAp.id, debit: 0, credit: amount }], idempotencyKey: `payment-allocation-${allocation.id}` }
        : { sourceType: "PAYMENT", sourceId: payment.id, description: `AP settlement ${payment.paymentNumber}`, entryDate: payment.paidAt, lines: [{ accountId: arAp.id, debit: amount, credit: 0 }, { accountId: cashAccount.id, debit: 0, credit: amount }], idempotencyKey: `payment-${payment.id}` }
      );
      await tx.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "PAYMENT_ALLOCATED", entityType: "PaymentAllocation", entityId: allocation.id, metadata: { paymentId: payment.id, invoiceId, amount } } });
      return { updatedInvoice: updated, allocation };
    });
  }

  async getTaxes(ctx: TenantContext) { return this.db.tax.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, orderBy: { code: "asc" } }); }
  async createTax(ctx: TenantContext, req: any) {
    if (req.rate < 0 || req.rate > 100) throw new Error("FINANCE_INVALID_TAX_RATE");
    const tax = await this.db.tax.create({ data: { id: req.id || randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, name: req.name, code: req.code, rate: req.rate, isInclusive: req.isInclusive ?? true, isActive: true } });
    await this.db.auditEvent.create({ data: { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: "finance-api", action: "TAX_CREATED", entityType: "Tax", entityId: tax.id, metadata: { code: tax.code, rate: Number(tax.rate) } } });
    return tax;
  }

  async getCashFlow(ctx: TenantContext, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error("FINANCE_INVALID_REPORT_PERIOD");
    const journals = await this.db.journalEntry.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, entryDate: { lte: end }, status: "POSTED" }, include: { lines: true }, orderBy: { entryDate: "asc" } });
    const accounts = await this.getAccounts(ctx);
    const lines = journals.flatMap((j: any) => j.lines);
    return FinancialReportingEngine.generateCashFlow(ctx as any, accounts as any, journals as any, lines as any, start, end);
  }

  async getFinancialAuditTrail(ctx: TenantContext) {
    return this.db.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, entityType: { in: ["Account","JournalEntry","CustomerInvoice","SupplierInvoice","Payment","PaymentAllocation","BankTransaction","Tax","AccountingPeriod"] } },
      orderBy: { createdAt: "desc" }, take: 500,
    });
  }

  async getBudgets(ctx: TenantContext) { return this.db.budget.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { lines: true } }); }
  async createBudget(ctx: TenantContext, req: any) { for (const l of req.lines ?? []) { const a = await this.db.account.findUnique({ where: { id: l.accountId } }); this.assertTenant(ctx, a); } const total = (req.lines ?? []).reduce((s: number, l: any) => s + l.budgetedAmount, 0); return this.db.budget.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, name: req.name, fiscalYear: req.fiscalYear, period: req.period ?? null, totalBudget: total, status: "APPROVED", lines: { create: (req.lines ?? []).map((l: any) => ({ accountId: l.accountId, costCenterId: l.costCenterId ?? null, budgetedAmount: l.budgetedAmount, actualAmount: 0, varianceAmount: l.budgetedAmount })) } } }); }

  async getTrialBalance(ctx: TenantContext, asOfDate?: string) {
    const reportDate = asOfDate ? new Date(asOfDate) : new Date();
    const journals = await this.db.journalEntry.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, entryDate: { lte: reportDate }, status: "POSTED" }, include: { lines: true } });
    const accounts = await this.getAccounts(ctx);
    const lines = journals.flatMap((j: any) => j.lines);
    return FinancialReportingEngine.generateTrialBalance(ctx as any, accounts as any, journals as any, lines as any, reportDate as any) ?? { accounts: [], totals: { totalDebit: 0, totalCredit: 0 }, asOfDate: reportDate.toISOString() };
  }




  async getProfitAndLoss(ctx: TenantContext, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
      throw new Error("FINANCE_INVALID_REPORT_PERIOD");
    }
    const journals = await this.db.journalEntry.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, entryDate: { gte: start, lte: end }, status: "POSTED" },
      include: { lines: true },
    });
    const accounts = await this.getAccounts(ctx);
    const lines = journals.flatMap((j: any) => j.lines);
    return FinancialReportingEngine.generateProfitAndLoss(ctx as any, accounts as any, journals as any, lines as any, "Standard", start, end);
  }

  async getBalanceSheet(ctx: TenantContext, asOfDate?: string) {
    const reportDate = asOfDate ? new Date(asOfDate) : new Date();
    if (!Number.isFinite(reportDate.getTime())) throw new Error("FINANCE_INVALID_REPORT_DATE");
    const journals = await this.db.journalEntry.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, entryDate: { lte: reportDate }, status: "POSTED" },
      include: { lines: true },
    });
    const accounts = await this.getAccounts(ctx);
    const lines = journals.flatMap((j: any) => j.lines);
    return FinancialReportingEngine.generateBalanceSheet(ctx as any, accounts as any, journals as any, lines as any, reportDate as any);
  }

  async getExecutiveDashboard(ctx: TenantContext) {
    const pnl = await this.getProfitAndLoss(ctx);
    const bs = await this.getBalanceSheet(ctx);
    const ar = await this.getReceivablesAging(ctx);
    const ap = await this.getPayablesAging(ctx);
    const budgets = await this.getBudgets(ctx);
    const totalBudget = budgets.reduce((s: number, b: any) => s + num(b.totalBudget), 0);
    const costs = Number(pnl.costOfGoodsSold.totalCogs || 0) + Number(pnl.operatingExpenses.totalOperatingExpenses || 0);
    return {
      revenue: Number(pnl.revenue.totalRevenue || 0), cogs: Number(pnl.costOfGoodsSold.totalCogs || 0),
      grossProfit: Number(pnl.grossProfit || 0), grossMarginPct: Number(pnl.grossMarginPct || 0),
      operatingExpenses: Number(pnl.operatingExpenses.totalOperatingExpenses || 0),
      netProfit: Number(pnl.netProfit || 0), netMarginPct: Number(pnl.netMarginPct || 0),
      cashPosition: Number(bs.assets.cashOnHand || 0), bankPosition: Number(bs.assets.bankBalances || 0),
      accountsReceivable: Number(bs.assets.accountsReceivable || 0), accountsPayable: Number(bs.liabilities.accountsPayable || 0),
      inventoryValue: Number(bs.assets.inventoryValuation || 0),
      overdueReceivablesCount: ar.items.length, overduePayablesCount: ap.items.length,
      budgetVariancePct: totalBudget ? ((costs - totalBudget) / totalBudget) * 100 : 0,
      branchProfitability: [{ branchId: ctx.branchId, branchName: ctx.branchId, revenue: Number(pnl.revenue.totalRevenue || 0), grossProfit: Number(pnl.grossProfit || 0), netProfit: Number(pnl.netProfit || 0), marginPct: Number(pnl.netMarginPct || 0) }],
    };
  }}
