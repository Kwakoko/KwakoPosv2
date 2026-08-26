import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./index.js";
import { AccountingEngine, FinancialBridge, PricingTaxEngine, PaymentEngine, CashSessionEngine, TransactionNumbering } from "@kwakopos2/domain";

export class PrismaAtomicCommercialFinanceService {
  constructor(private readonly db: any = prisma) {}

  private async accounts(tx: any, ctx: TenantContext) {
    const codes = [
      ["1110", "Cash", "ASSET", "CASH"], ["1210", "Bank", "ASSET", "BANK"],
      ["1310", "Accounts Receivable", "ASSET", "ACCOUNTS_RECEIVABLE"], ["1410", "Inventory", "ASSET", "INVENTORY"],
      ["2110", "Accounts Payable", "LIABILITY", "ACCOUNTS_PAYABLE"], ["2210", "Tax Payable", "LIABILITY", "TAX_PAYABLE"],
      ["4100", "Sales Revenue", "REVENUE", "SALES"], ["4900", "Sales Discount", "REVENUE", "DISCOUNT"],
      ["5100", "Cost of Goods Sold", "COGS", "COGS"], ["6900", "Operating Expense", "EXPENSE", "OPERATING"], ["8100", "Cash Variance", "OTHER_EXPENSE", "VARIANCE"],
    ] as const;
    const result: Record<string, string> = {};
    for (const [code, name, accountClass, accountGroup] of codes) {
      let row = await tx.account.findFirst({ where: { tenantId: ctx.tenantId, accountCode: code, OR: [{ branchId: ctx.branchId }, { branchId: null }] } });
      if (!row) row = await tx.account.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, accountCode: code, name, accountClass, accountGroup, currency: "TZS", isSystem: true, isActive: true, currentBalance: 0 } });
      result[code] = row.id;
    }
    return { cashAccountId: result["1110"], bankAccountId: result["1210"], receivableAccountId: result["1310"], inventoryAccountId: result["1410"], payableAccountId: result["2110"], taxPayableAccountId: result["2210"], salesRevenueAccountId: result["4100"], salesDiscountAccountId: result["4900"], cogsAccountId: result["5100"], expenseDefaultAccountId: result["6900"], cashVarianceAccountId: result["8100"] };
  }

  private async writeJournal(tx: any, ctx: TenantContext, built: any) {
    const j = await tx.journalEntry.create({ data: { id: built.journal.id, tenantId: ctx.tenantId, branchId: ctx.branchId, journalNumber: built.journal.journalNumber, entryDate: new Date(built.journal.entryDate), postingDate: new Date(built.journal.postingDate), sourceType: built.journal.sourceType, sourceId: built.journal.sourceId ?? null, description: built.journal.description, currency: built.journal.currency, exchangeRate: built.journal.exchangeRate ?? 1, totalDebit: built.journal.totalDebit, totalCredit: built.journal.totalCredit, status: "POSTED", isReversal: false, reversalOfJournalId: null, reversalReason: null, createdById: ctx.userId, postedById: ctx.userId, postedAt: new Date(), idempotencyKey: built.journal.idempotencyKey } });
    const lines = await Promise.all((built.lines || []).map((l: any) => tx.journalLine.create({ data: { id: l.id, journalEntryId: j.id, accountId: l.accountId, costCenterId: l.costCenterId ?? null, description: l.description ?? null, debit: l.debit, credit: l.credit, currency: l.currency ?? built.journal.currency, exchangeRate: l.exchangeRate ?? 1 } })));
    return { journal: j, lines };
  }

  async createSale(ctx: TenantContext, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const existing = await tx.sale.findUnique({ where: { idempotencyKey: req.idempotencyKey }, include: { lines: true, payments: true } });
      if (existing) return { sale: existing, lines: existing.lines, ledgers: await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, referenceType: "SALE", referenceId: existing.id } }) };
      for (const item of req.items) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!v || v.tenantId !== ctx.tenantId || v.branchId !== ctx.branchId || v.productId !== item.productId) throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
      }
      const lines = req.items.map((item: any) => { const c = PricingTaxEngine.calculateLineItem({ unitPrice: item.unitPrice, unitCost: item.unitCost || 0, quantity: item.quantity, discount: item.discountAmount ? { type: "FIXED", value: item.discountAmount } : undefined }); return { id: crypto.randomUUID(), productId: item.productId, variantId: item.variantId, quantity: item.quantity, unitPrice: c.unitPrice, unitCost: c.unitCost, discountAmount: c.discountAmount, taxAmount: c.taxAmount, lineTotal: c.lineTotal }; });
      const totals = PricingTaxEngine.calculateSaleTotals(lines.map((l: any) => ({ lineTotal: l.lineTotal, totalCost: l.unitCost * l.quantity, discountAmount: l.discountAmount, taxAmount: l.taxAmount })), req.discountTotal || 0);
      const saleId = req.id || crypto.randomUUID(); const now = new Date();
      const saleNumber = TransactionNumbering.formatNumber("SAL", "MAIN", (await tx.sale.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      const payments: any[] = [];
      for (const p of req.payments || []) { const r = PaymentEngine.processPayment({ tenantId: ctx.tenantId, branchId: ctx.branchId, amount: p.amount, paymentMethod: p.paymentMethod, provider: p.provider, providerReference: p.providerReference, customerId: req.customerId }); if (!r.success) throw new Error("PAYMENT_REJECTED"); payments.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber: TransactionNumbering.formatNumber("PAY", "MAIN", (await tx.payment.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + payments.length + 1), saleId, amount: p.amount, paymentMethod: p.paymentMethod, provider: p.provider ?? null, providerReference: r.reference, status: "COMPLETED", paidAt: now }); }
      const paymentStatus = PaymentEngine.evaluateSalePaymentStatus(totals.grandTotal, payments.map((p) => ({ amount: p.amount, status: p.status }))).paymentStatus;
      const sale = await tx.sale.create({ data: { id: saleId, tenantId: ctx.tenantId, branchId: ctx.branchId, saleNumber, customerId: req.customerId ?? null, cashSessionId: req.cashSessionId ?? null, subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, grandTotal: totals.grandTotal, totalCost: totals.totalCost, grossProfit: totals.grossProfit, status: "COMPLETED", paymentStatus, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: req.idempotencyKey, soldById: ctx.userId, soldAt: now, lines: { create: lines }, payments: { create: payments } }, include: { lines: true, payments: true } });
      const ledgers = await Promise.all(lines.map((l: any, i: number) => tx.stockLedger.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, productId: l.productId, variantId: l.variantId, movementType: "SALE", quantity: -Math.abs(l.quantity), referenceType: "SALE", referenceId: sale.id, occurredAt: now, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: `${req.idempotencyKey}-${l.variantId}-${i}` } })));
      const lookup = await this.accounts(tx, ctx);
      const tender = payments[0]?.paymentMethod === "BANK" ? "BANK" : payments[0]?.paymentMethod === "CREDIT" ? "CREDIT" : payments[0]?.paymentMethod === "MOBILE_MONEY" ? "MOBILE_MONEY" : "CASH";
      const built = FinancialBridge.mapSaleToJournal(ctx, sale as any, lookup as any, tender as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      await this.writeJournal(tx, ctx, built);
      return { sale, lines: sale.lines, ledgers };
    });
  }

  async createPurchaseReceipt(ctx: TenantContext, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const supplier = await tx.supplier.findUnique({ where: { id: req.supplierId } }); if (!supplier || supplier.tenantId !== ctx.tenantId || supplier.branchId !== ctx.branchId) throw new Error("FINANCE_SUPPLIER_BOUNDARY_VIOLATION");
      for (const item of req.items) { const v = await tx.productVariant.findUnique({ where: { id: item.variantId } }); if (!v || v.tenantId !== ctx.tenantId || v.branchId !== ctx.branchId) throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION"); }
      const receiptId = req.id || crypto.randomUUID(); const now = new Date(); const number = TransactionNumbering.formatNumber("REC", "MAIN", (await tx.purchaseReceipt.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1); const total = req.items.reduce((s: number, i: any) => s + i.quantityReceived * i.unitCost, 0);
      const receipt = await tx.purchaseReceipt.create({ data: { id: receiptId, tenantId: ctx.tenantId, branchId: ctx.branchId, receiptNumber: number, purchaseOrderId: req.purchaseOrderId ?? null, supplierId: req.supplierId, receivedAt: now, createdById: ctx.userId, notes: req.notes ?? null, items: { create: req.items.map((i: any) => ({ id: crypto.randomUUID(), variantId: i.variantId, quantityReceived: i.quantityReceived, unitCost: i.unitCost, totalCost: i.quantityReceived * i.unitCost, batchNumber: i.batchNumber ?? null, expiryDate: i.expiryDate ? new Date(i.expiryDate) : null })) } }, include: { items: true } });
      await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { increment: total } } });
      const ledgers = await Promise.all(req.items.map((i: any, idx: number) => { const item = receipt.items[idx]; return tx.stockLedger.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, productId: item.variantId, variantId: item.variantId, movementType: "PURCHASE", quantity: i.quantityReceived, referenceType: "PURCHASE_RECEIPT", referenceId: receipt.id, occurredAt: now, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: `${req.idempotencyKey}-${i.variantId}-${idx}` } }); }));
      const variants = await tx.productVariant.findMany({ where: { id: { in: req.items.map((i: any) => i.variantId) } } }); for (const l of ledgers) { const v = variants.find((x: any) => x.id === l.variantId); await tx.stockLedger.update({ where: { id: l.id }, data: { productId: v?.productId || l.productId } }); }
      const lookup = await this.accounts(tx, ctx); const built = FinancialBridge.mapGoodsReceiptToJournal(ctx, { ...(receipt as any), items: receipt.items.map((x: any) => ({ ...x, totalCost: Number(x.totalCost) })) }, lookup as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1); await this.writeJournal(tx, ctx, built);
      return { receipt, ledgers };
    });
  }

  async recordExpense(ctx: TenantContext, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const session = req.cashSessionId ? await tx.cashSession.findUnique({ where: { id: req.cashSessionId } }) : null; if (session) { if (session.tenantId !== ctx.tenantId || session.branchId !== ctx.branchId) throw new Error("FINANCE_CASH_SESSION_BOUNDARY_VIOLATION"); if (session.status === "CLOSED") throw new Error("CASH_SESSION_CLOSED"); }
      const now = new Date(); const expense = await tx.expense.create({ data: { id: req.id || crypto.randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, cashSessionId: req.cashSessionId ?? null, category: req.category, amount: req.amount, reason: req.reason, authorizedById: ctx.userId, incurredAt: now } });
      if (session) await tx.cashSession.update({ where: { id: session.id }, data: { cashExpensesTotal: { increment: req.amount } } });
      const lookup = await this.accounts(tx, ctx); const built = FinancialBridge.mapExpenseToJournal(ctx, expense as any, lookup.expenseDefaultAccountId, lookup as any, false, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1); await this.writeJournal(tx, ctx, built); return expense;
    });
  }
}
