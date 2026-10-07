import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { randomUUID } from "node:crypto";
import { AccountingEngine, FinancialReportingEngine, TransactionNumbering, FinancialBridge, ReceivablesPayablesEngine } from "@kwakopos2/domain";


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


  async getCustomerInvoices(ctx: TenantContext) {
    return this.db.customerInvoice.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
      include: { lines: true, allocations: true },
      orderBy: [{ invoiceDate: "desc" }, { invoiceNumber: "desc" }],
    });
  }

  async getSupplierInvoices(ctx: TenantContext) {
    return this.db.supplierInvoice.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
      include: { lines: true, allocations: true },
      orderBy: [{ invoiceDate: "desc" }, { invoiceNumber: "desc" }],
    });
  }

  async createCustomerInvoice(ctx: TenantContext, req: any) {
    const customer = await this.db.customer.findUnique({ where: { id: req.customerId } });
    this.assertTenant(ctx, customer);
    if (customer.status !== "ACTIVE") throw new Error("FINANCE_CUSTOMER_NOT_ACTIVE");

    return this.db.$transaction(async (tx: any) => {
      if (req.id) {
        const existing = await tx.customerInvoice.findUnique({ where: { id: req.id }, include: { lines: true, allocations: true } });
        if (existing) {
          this.assertTenant(ctx, existing);
          return existing;
        }
      }

      const sequence = (await tx.customerInvoice.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1;
      const id = req.id || undefined;
      const now = new Date();
      const lines = (req.items || []).map((i: any) => {
        const lineTax = i.taxRate ? Number(i.quantity) * Number(i.unitPrice) * Number(i.taxRate) / 100 : 0;
        const lineDiscount = Number(i.discountAmount || 0);
        const lineSubtotal = Number(i.quantity) * Number(i.unitPrice);
        return {
          id: i.id,
          variantId: i.variantId ?? null,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          taxRate: Number(i.taxRate || 0),
          taxAmount: lineTax,
          discountAmount: lineDiscount,
          lineTotal: lineSubtotal + lineTax - lineDiscount,
        };
      });
      const subtotal = lines.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
      const taxTotal = lines.reduce((s: number, i: any) => s + i.taxAmount, 0);
      const discountTotal = lines.reduce((s: number, i: any) => s + i.discountAmount, 0);
      const total = subtotal + taxTotal - discountTotal;
      const invoice = await tx.customerInvoice.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          customerId: req.customerId,
          saleId: req.saleId ?? null,
          invoiceNumber: req.invoiceNumber || `${TransactionNumbering.formatNumber("INV", "MAIN", sequence)}-${randomUUID().slice(0, 6).toUpperCase()}`,
          invoiceDate: req.invoiceDate ? new Date(req.invoiceDate) : now,
          dueDate: new Date(req.dueDate),
          subtotal,
          taxTotal,
          discountTotal,
          grandTotal: total,
          amountPaid: 0,
          balanceDue: total,
          status: "ISSUED",
          notes: req.notes ?? null,
          lines: { create: lines },
        },
        include: { lines: true, allocations: true },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: `finance-api:${ctx.userId}`,
          action: "AR_INVOICE_CREATED",
          entityType: "CustomerInvoice",
          entityId: invoice.id,
          metadata: { invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, grandTotal: total, dueDate: invoice.dueDate.toISOString() },
        },
      });
      return invoice;
    });
  }

  async createSupplierInvoice(ctx: TenantContext, req: any) {
    const supplier = await this.db.supplier.findUnique({ where: { id: req.supplierId } });
    this.assertTenant(ctx, supplier);
    if (supplier.status !== "ACTIVE") throw new Error("FINANCE_SUPPLIER_NOT_ACTIVE");

    return this.db.$transaction(async (tx: any) => {
      if (req.id) {
        const existing = await tx.supplierInvoice.findUnique({ where: { id: req.id }, include: { lines: true, allocations: true } });
        if (existing) {
          this.assertTenant(ctx, existing);
          return existing;
        }
      }

      const invoiceNumber = String(req.invoiceNumber || `BIL-${Date.now()}`).trim();
      const duplicate = await tx.supplierInvoice.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, invoiceNumber },
      });
      if (duplicate) throw new Error("SUPPLIER_INVOICE_DUPLICATE_NUMBER");

      const lines = (req.items || []).map((i: any) => {
        const quantity = Number(i.quantity);
        const unitCost = Number(i.unitCost);
        const taxRate = Number(i.taxRate || 0);
        const taxAmount = quantity * unitCost * taxRate / 100;
        return {
          id: i.id || randomUUID(),
          variantId: i.variantId ?? null,
          description: String(i.description),
          quantity,
          unitCost,
          taxRate,
          taxAmount,
          lineTotal: quantity * unitCost + taxAmount,
        };
      });
      const subtotal = lines.reduce((x: number, i: any) => x + i.quantity * i.unitCost, 0);
      const tax = lines.reduce((x: number, i: any) => x + i.taxAmount, 0);
      const total = subtotal + tax;
      if (!(total >= 0)) throw new Error("SUPPLIER_INVOICE_TOTAL_INVALID");

      const invoice = await tx.supplierInvoice.create({
        data: {
          id: req.id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          supplierId: req.supplierId,
          purchaseReceiptId: req.purchaseReceiptId ?? null,
          invoiceNumber,
          invoiceDate: req.invoiceDate ? new Date(req.invoiceDate) : new Date(),
          dueDate: new Date(req.dueDate),
          subtotal,
          taxTotal: tax,
          grandTotal: total,
          amountPaid: 0,
          balanceDue: total,
          status: "APPROVED",
          notes: req.notes ?? null,
          lines: { create: lines },
        },
        include: { lines: true, allocations: true },
      });

      await tx.supplier.update({
        where: { id: supplier.id },
        data: { outstandingBalance: { increment: total } },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: `finance-api:${ctx.userId}`,
          action: "AP_INVOICE_CREATED",
          entityType: "SupplierInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            supplierId: supplier.id,
            grandTotal: total,
            dueDate: invoice.dueDate.toISOString(),
          },
        },
      });
      return invoice;
    });
  }

  async getReceivablesAging(ctx: TenantContext, asOfDate = new Date()) {
    const [customers, invoices] = await Promise.all([
      this.db.customer.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, select: { id: true, name: true, customerCode: true } }),
      this.getCustomerInvoices(ctx),
    ]);
    const report = ReceivablesPayablesEngine.generateReceivablesAgingReport(
      ctx,
      customers,
      invoices.map((i: any) => ({ ...i, amountPaid: Number(i.amountPaid), balanceDue: Number(i.balanceDue), grandTotal: Number(i.grandTotal) })) as any,
      asOfDate,
    );
    return report;
  }

  async getPayablesAging(ctx: TenantContext, asOfDate = new Date()) {
    const [suppliers, invoices] = await Promise.all([
      this.db.supplier.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
        select: { id: true, name: true, supplierCode: true },
      }),
      this.getSupplierInvoices(ctx),
    ]);
    return ReceivablesPayablesEngine.generatePayablesAgingReport(
      ctx,
      suppliers,
      invoices.map((i: any) => ({
        ...i,
        amountPaid: Number(i.amountPaid),
        balanceDue: Number(i.balanceDue),
        grandTotal: Number(i.grandTotal),
      })) as any,
      asOfDate,
    );
  }

  async getSupplierStatement(ctx: TenantContext, supplierId: string, from?: string, to?: string) {
    const supplier = await this.db.supplier.findUnique({ where: { id: supplierId } });
    this.assertTenant(ctx, supplier);
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : new Date();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
      throw new Error("FINANCE_INVALID_STATEMENT_PERIOD");
    }

    const invoices = await this.db.supplierInvoice.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, supplierId, invoiceDate: { lte: end } },
      include: { allocations: true, lines: true },
      orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
    });
    const invoiceIds = invoices.map((i: any) => i.id);
    const allocations = invoiceIds.length
      ? await this.db.paymentAllocation.findMany({
          where: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            supplierInvoiceId: { in: invoiceIds },
            allocatedAt: { lte: end },
          },
          orderBy: { allocatedAt: "asc" },
        })
      : [];
    const payments = await this.db.payment.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, supplierId, status: "COMPLETED", paidAt: { lte: end } },
      orderBy: { paidAt: "asc" },
    });

    const startMs = start.getTime();
    const openingDebit = invoices
      .filter((i: any) => new Date(i.invoiceDate).getTime() < startMs)
      .reduce((s: number, i: any) => s + Number(i.grandTotal), 0);
    const openingCredit = allocations
      .filter((a: any) => new Date(a.allocatedAt).getTime() < startMs)
      .reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
    const openingBalance = openingDebit - openingCredit;

    const invoiceEntries = invoices
      .filter((i: any) => new Date(i.invoiceDate).getTime() >= startMs)
      .map((i: any) => ({
        type: "INVOICE",
        id: i.id,
        reference: i.invoiceNumber,
        date: i.invoiceDate,
        debit: Number(i.grandTotal),
        credit: 0,
        balanceDue: Number(i.balanceDue),
        status: i.status,
      }));
    const allocationEntries = allocations
      .filter((a: any) => new Date(a.allocatedAt).getTime() >= startMs)
      .map((a: any) => ({
        type: "PAYMENT_ALLOCATION",
        id: a.id,
        reference: a.paymentId,
        date: a.allocatedAt,
        debit: 0,
        credit: Number(a.allocatedAmount),
        supplierInvoiceId: a.supplierInvoiceId,
      }));
    const entries = [...invoiceEntries, ...allocationEntries].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let runningBalance = openingBalance;
    for (const entry of entries as any[]) {
      runningBalance += Number(entry.debit) - Number(entry.credit);
      entry.runningBalance = Math.round(runningBalance * 100) / 100;
    }

    const totalPayments = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    const totalAllocated = allocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      supplierId,
      supplier: {
        id: supplier.id,
        supplierCode: supplier.supplierCode,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
      },
      period: { from: start.toISOString(), to: end.toISOString() },
      openingBalance: Math.round(openingBalance * 100) / 100,
      entries,
      closingBalance: Math.round(runningBalance * 100) / 100,
      currentBalance: Number(supplier.outstandingBalance),
      payments,
      totalPayments,
      totalAllocated,
      unappliedPayments: Math.round(Math.max(0, totalPayments - totalAllocated) * 100) / 100,
    };
  }

  async getPayablesLedger(ctx: TenantContext, supplierId?: string) {
    const where: any = { tenantId: ctx.tenantId, branchId: ctx.branchId };
    if (supplierId) where.supplierId = supplierId;
    if (supplierId) {
      const supplier = await this.db.supplier.findUnique({ where: { id: supplierId } });
      this.assertTenant(ctx, supplier);
    }
    const [invoices, payments] = await Promise.all([
      this.db.supplierInvoice.findMany({
        where,
        include: { allocations: true, lines: true },
        orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
      }),
      this.db.payment.findMany({
        where: { ...where, supplierId: supplierId ?? undefined, status: "COMPLETED" },
        orderBy: { paidAt: "asc" },
      }),
    ]);
    const invoiceIds = invoices.map((i: any) => i.id);
    const allocations = invoiceIds.length
      ? await this.db.paymentAllocation.findMany({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, supplierInvoiceId: { in: invoiceIds } },
          orderBy: { allocatedAt: "asc" },
        })
      : [];
    const totalInvoiced = invoices.reduce((s: number, i: any) => s + Number(i.grandTotal), 0);
    const totalOutstanding = invoices.reduce((s: number, i: any) => s + Number(i.balanceDue), 0);
    const totalAllocated = allocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
    const totalPayments = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      supplierId: supplierId ?? null,
      invoices,
      payments,
      allocations,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      totalUnappliedPayments: Math.round(Math.max(0, totalPayments - totalAllocated) * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      reconciles: Math.abs(totalInvoiced - totalAllocated - totalOutstanding) <= 0.01,
    };
  }

  async allocatePayment(ctx: TenantContext, req: any) {
    if (!req.customerInvoiceId && !req.supplierInvoiceId) throw new Error("FINANCE_PAYMENT_TARGET_REQUIRED");
    if (req.customerInvoiceId && req.supplierInvoiceId) throw new Error("FINANCE_PAYMENT_TARGET_AMBIGUOUS");
    return this.db.$transaction(async (tx: any) => {
      if (req.allocationId) {
        const existingAllocation = await tx.paymentAllocation.findUnique({ where: { id: req.allocationId } });
        if (existingAllocation) {
          this.assertTenant(ctx, existingAllocation);
          const existingInvoice = existingAllocation.customerInvoiceId
            ? await tx.customerInvoice.findUnique({ where: { id: existingAllocation.customerInvoiceId }, include: { allocations: true, lines: true } })
            : await tx.supplierInvoice.findUnique({ where: { id: existingAllocation.supplierInvoiceId }, include: { allocations: true, lines: true } });
          this.assertTenant(ctx, existingInvoice);
          return {
            updatedInvoice: existingInvoice,
            allocation: existingAllocation,
            remainingUnallocated: Math.max(0, Number(req.amount) - Number(existingAllocation.allocatedAmount)),
          };
        }
      }
      const payment = await tx.payment.findUnique({ where: { id: req.paymentId } });
      this.assertTenant(ctx, payment);
      if (payment.status !== "COMPLETED") throw new Error("FINANCE_PAYMENT_NOT_COMPLETED");
      const invoice = req.customerInvoiceId
        ? await tx.customerInvoice.findUnique({ where: { id: req.customerInvoiceId }, include: { allocations: true, lines: true } })
        : await tx.supplierInvoice.findUnique({ where: { id: req.supplierInvoiceId }, include: { allocations: true, lines: true } });
      this.assertTenant(ctx, invoice);
      if (["CANCELLED", "REJECTED", "PAID"].includes(invoice.status)) throw new Error("FINANCE_INVOICE_NOT_ALLOCATABLE");

      const paymentAllocations = await tx.paymentAllocation.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, paymentId: payment.id } });
      const paymentAllocated = paymentAllocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
      const paymentRemaining = Math.max(0, Number(payment.amount) - paymentAllocated);
      const requestedAmount = Number(req.amount);
      const allocationAmount = Math.min(requestedAmount, Number(invoice.balanceDue), paymentRemaining);
      if (!(allocationAmount > 0)) throw new Error("FINANCE_PAYMENT_NO_REMAINING_ALLOCATABLE_AMOUNT");

      if (req.customerInvoiceId && payment.customerId && payment.customerId !== invoice.customerId) {
        throw new Error("FINANCE_PAYMENT_CUSTOMER_MISMATCH");
      }
      if (req.supplierInvoiceId && payment.supplierId && payment.supplierId !== invoice.supplierId) {
        throw new Error("FINANCE_PAYMENT_SUPPLIER_MISMATCH");
      }

      const newAmountPaid = Number(invoice.amountPaid) + allocationAmount;
      const newBalanceDue = Math.max(0, Number(invoice.balanceDue) - allocationAmount);
      const newStatus = newBalanceDue <= 0 ? "PAID" : newAmountPaid > 0 ? "PARTIALLY_PAID" : invoice.status;
      const updatedInvoice = req.customerInvoiceId
        ? await tx.customerInvoice.update({
            where: { id: invoice.id },
            data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus },
            include: { lines: true, allocations: true },
          })
        : await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: { amountPaid: newAmountPaid, balanceDue: newBalanceDue, status: newStatus },
            include: { lines: true, allocations: true },
          });

      const allocation = await tx.paymentAllocation.create({
        data: {
          id: req.allocationId || randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          paymentId: payment.id,
          customerInvoiceId: req.customerInvoiceId ?? null,
          supplierInvoiceId: req.supplierInvoiceId ?? null,
          allocatedAmount: allocationAmount,
          createdById: ctx.userId,
        },
      });

      if (req.customerInvoiceId) {
        const customer = await tx.customer.findUnique({ where: { id: invoice.customerId } });
        this.assertTenant(ctx, customer);
        await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: allocationAmount } } });
      } else {
        const supplier = await tx.supplier.findUnique({ where: { id: invoice.supplierId } });
        this.assertTenant(ctx, supplier);
        await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { decrement: allocationAmount } } });
      }

      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: `finance-api:${ctx.userId}`,
          action: req.supplierInvoiceId ? "AP_PAYMENT_ALLOCATED" : "AR_PAYMENT_ALLOCATED",
          entityType: req.customerInvoiceId ? "CustomerInvoice" : "SupplierInvoice",
          entityId: invoice.id,
          metadata: { paymentId: payment.id, allocationId: allocation.id, amount: allocationAmount, remainingUnallocated: Number(req.amount) - allocationAmount, status: newStatus },
        },
      });

      return { updatedInvoice, allocation, remainingUnallocated: Number(req.amount) - allocationAmount };
    });
  }

  async getCustomerStatement(ctx: TenantContext, customerId: string, from?: string, to?: string) {
    const customer = await this.db.customer.findUnique({ where: { id: customerId } });
    this.assertTenant(ctx, customer);
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : new Date();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error("FINANCE_INVALID_STATEMENT_PERIOD");

    const [invoices, payments] = await Promise.all([
      this.db.customerInvoice.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, customerId, invoiceDate: { lte: end } },
        include: { allocations: true, lines: true },
        orderBy: { invoiceDate: "asc" },
      }),
      this.db.payment.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, customerId, status: "COMPLETED", paidAt: { lte: end } }, orderBy: { paidAt: "asc" } }),
    ]);

    const startMs = start.getTime();
    const openingBalance = Number(customer.openingBalance) +
      invoices.filter((i: any) => new Date(i.invoiceDate).getTime() < startMs).reduce((s: number, i: any) => s + Number(i.grandTotal), 0) -
      payments.filter((p: any) => new Date(p.paidAt).getTime() < startMs).reduce((s: number, p: any) => s + Number(p.amount), 0);

    const entries = [
      ...invoices.filter((i: any) => new Date(i.invoiceDate).getTime() >= startMs).map((i: any) => ({
        type: "INVOICE", id: i.id, reference: i.invoiceNumber, date: i.invoiceDate, debit: Number(i.grandTotal), credit: 0, balanceDue: Number(i.balanceDue), status: i.status,
      })),
      ...payments.filter((p: any) => new Date(p.paidAt).getTime() >= startMs).map((p: any) => ({
        type: "PAYMENT", id: p.id, reference: p.paymentNumber, date: p.paidAt, debit: 0, credit: Number(p.amount), status: p.status,
      })),
    ].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = openingBalance;
    for (const entry of entries as any[]) {
      runningBalance += Number(entry.debit) - Number(entry.credit);
      entry.runningBalance = Math.round(runningBalance * 100) / 100;
    }

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId,
      customer: { id: customer.id, customerCode: customer.customerCode, name: customer.name },
      period: { from: start.toISOString(), to: end.toISOString() },
      openingBalance: Math.round(openingBalance * 100) / 100,
      entries,
      closingBalance: Math.round(runningBalance * 100) / 100,
      currentBalance: Number(customer.currentBalance),
    };
  }

  async getReceivablesLedger(ctx: TenantContext, customerId?: string) {
    const where: any = { tenantId: ctx.tenantId, branchId: ctx.branchId };
    if (customerId) where.customerId = customerId;
    const invoices = await this.db.customerInvoice.findMany({ where, include: { allocations: true, lines: true }, orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }] });
    const payments = await this.db.payment.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, ...(customerId ? { customerId } : {}), status: "COMPLETED" },
      orderBy: { paidAt: "asc" },
    });
    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customerId ?? null,
      invoices,
      payments,
      totalInvoiced: invoices.reduce((s: number, i: any) => s + Number(i.grandTotal), 0),
      totalCollected: payments.reduce((s: number, p: any) => s + Number(p.amount), 0),
      totalOutstanding: invoices.reduce((s: number, i: any) => s + Number(i.balanceDue), 0),
    };
  }

  async getReceivablesCollections(ctx: TenantContext, asOfDate = new Date()) {
    const invoices = await this.db.customerInvoice.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, balanceDue: { gt: 0 }, dueDate: { lt: asOfDate }, status: { notIn: ["PAID", "CANCELLED"] } },
      include: { lines: true, allocations: true },
      orderBy: { dueDate: "asc" },
    });
    const customerIds = [...new Set(invoices.map((i: any) => i.customerId))];
    const customers: any[] = await this.db.customer.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, id: { in: customerIds } }, select: { id: true, customerCode: true, name: true, phone: true, email: true, creditLimit: true, currentBalance: true } });
    const byId = new Map<string, any>(customers.map((c: any) => [c.id, c]));
    const rows = invoices.map((i: any) => {
      const customer = byId.get(i.customerId);
      const daysOverdue = ReceivablesPayablesEngine.calculateDaysOverdue(i.dueDate, asOfDate);
      const balance = Number(i.balanceDue);
      return {
        invoiceId: i.id, invoiceNumber: i.invoiceNumber, customerId: i.customerId,
        customer: customer ? { id: customer.id, code: customer.customerCode, name: customer.name, phone: customer.phone, email: customer.email } : null,
        dueDate: i.dueDate, daysOverdue, balanceDue: balance,
        collectionPriority: daysOverdue >= 90 || (Number(customer?.creditLimit || 0) > 0 && balance >= Number(customer?.creditLimit || 0)) ? "CRITICAL" : daysOverdue >= 60 ? "HIGH" : daysOverdue >= 31 ? "MEDIUM" : "LOW",
      };
    }).sort((a: any, b: any) => b.daysOverdue - a.daysOverdue || b.balanceDue - a.balanceDue);

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      asOfDate: asOfDate.toISOString(),
      count: rows.length,
      totalOverdue: rows.reduce((s: number, r: any) => s + r.balanceDue, 0),
      rows,
    };
  }

  async recordCollectionAction(ctx: TenantContext, req: any) {
    const invoice = await this.db.customerInvoice.findUnique({ where: { id: req.invoiceId } });
    this.assertTenant(ctx, invoice);
    if (Number(invoice.balanceDue) <= 0 || ["PAID", "CANCELLED"].includes(invoice.status)) {
      throw new Error("AR_COLLECTION_INVOICE_NOT_OPEN");
    }
    const action = String(req.action || "").trim().toUpperCase();
    const allowed = new Set(["CALL", "SMS", "EMAIL", "PROMISE_TO_PAY", "FOLLOW_UP", "ESCALATE"]);
    if (!allowed.has(action)) throw new Error("AR_COLLECTION_ACTION_INVALID");
    const event = await this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        deviceId: `finance-api:${ctx.userId}`,
        action: `AR_COLLECTION_${action}`,
        entityType: "CustomerInvoice",
        entityId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          balanceDue: Number(invoice.balanceDue),
          note: req.note ?? null,
          nextFollowUpAt: req.nextFollowUpAt ?? null,
        },
      },
    });
    return { id: event.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, action, recordedAt: event.createdAt };
  }

  async getBankAccounts(ctx: TenantContext) { return this.db.bankAccount.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, include: { transactions: true } }); }
  async createBankAccount(ctx: TenantContext, req: any) { const dup = await this.db.bankAccount.findFirst({ where: { tenantId: ctx.tenantId, accountNumber: req.accountNumber } }); if (dup) throw new Error("FINANCE_BANK_ACCOUNT_EXISTS"); return this.db.bankAccount.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, accountName: req.accountName, bankName: req.bankName, accountNumber: req.accountNumber, currency: req.currency ?? "TZS", openingBalance: req.openingBalance ?? 0, currentBalance: req.openingBalance ?? 0, isActive: true } }); }
  async recordBankTransaction(ctx: TenantContext, bankAccountId: string, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const bank = await tx.bankAccount.findUnique({ where: { id: bankAccountId } });
      this.assertTenant(ctx, bank);
      const type = String(req.transactionType).toUpperCase();
      const amount = Number(req.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("FINANCE_INVALID_BANK_TRANSACTION_AMOUNT");
      const signedDelta = new Set(["DEPOSIT", "TRANSFER_IN", "INTEREST"]).has(type)
        ? amount
        : new Set(["WITHDRAWAL", "TRANSFER_OUT", "FEE"]).has(type)
          ? -amount
          : amount;
      const t = await tx.bankTransaction.create({ data: {
        id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, bankAccountId,
        transactionDate: new Date(req.transactionDate ?? new Date()), transactionType: req.transactionType,
        amount: signedDelta, reference: req.reference, description: req.description ?? null,
      } });
      await tx.bankAccount.update({ where: { id: bankAccountId }, data: { currentBalance: { increment: signedDelta } } });
      return t;
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
