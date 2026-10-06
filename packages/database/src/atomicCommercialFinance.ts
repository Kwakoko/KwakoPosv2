import { randomUUID } from "node:crypto";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { AccountingEngine, FinancialBridge, PricingTaxEngine, PaymentEngine, CashSessionEngine, TransactionNumbering, calculateAvailableStock } from "@kwakopos2/domain";
import { projectProductBranchStock, projectProductStockSummary, projectVariantInventory } from "./inventoryAuthority.js";

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
    const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: built.journal.idempotencyKey } }).catch(() => null);
    if (existing) {
      const lines = await tx.journalLine.findMany({ where: { journalEntryId: existing.id } });
      return { journal: existing, lines };
    }
    const j = await tx.journalEntry.create({ data: {
      id: built.journal.id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      journalNumber: built.journal.journalNumber,
      entryDate: new Date(built.journal.entryDate),
      postingDate: new Date(built.journal.postingDate),
      sourceType: built.journal.sourceType,
      sourceId: built.journal.sourceId ?? null,
      description: built.journal.description,
      currency: built.journal.currency,
      exchangeRate: built.journal.exchangeRate ?? 1,
      totalDebit: built.journal.totalDebit,
      totalCredit: built.journal.totalCredit,
      status: "POSTED",
      isReversal: Boolean(built.journal.isReversal),
      reversalOfJournalId: built.journal.reversalOfJournalId ?? null,
      reversalReason: built.journal.reversalReason ?? null,
      createdById: ctx.userId,
      postedById: ctx.userId,
      postedAt: new Date(),
      idempotencyKey: built.journal.idempotencyKey
    } });
    const lines = await Promise.all((built.lines || []).map((l: any) => tx.journalLine.create({ data: { id: l.id, journalEntryId: j.id, accountId: l.accountId, costCenterId: l.costCenterId ?? null, description: l.description ?? null, debit: l.debit, credit: l.credit, currency: l.currency ?? built.journal.currency, exchangeRate: l.exchangeRate ?? 1 } })));
    return { journal: j, lines };
  }

  async createSale(ctx: TenantContext, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const existing = await tx.sale.findUnique({ where: { idempotencyKey: req.idempotencyKey }, include: { lines: true, payments: true } });
      if (existing) {
        if (existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) {
          throw new Error("FINANCE_SALE_BOUNDARY_VIOLATION");
        }
        const drawerOperations: any[] = [];
        const existingPayments = Array.isArray(existing.payments) ? existing.payments : [];
        for (const payment of existingPayments.filter((p: any) => p.paymentMethod === "CASH" && p.status === "COMPLETED")) {
          const current = await tx.drawerOperation.findUnique({ where: { paymentId: payment.id } }).catch(() => null);
          if (current) { drawerOperations.push(current); continue; }
          const operation = await tx.drawerOperation.create({ data: {
            id: `drawer:${payment.id}`, tenantId: ctx.tenantId, branchId: ctx.branchId,
            cashSessionId: existing.cashSessionId ?? null, paymentId: payment.id, saleId: existing.id,
            operationType: "PAYMENT", status: "PENDING", attempts: 0, deviceId: existing.deviceId,
            requestedById: ctx.userId, metadata: { amount: Number(payment.amount), paymentMethod: payment.paymentMethod },
          } });
          await tx.payment.update({ where: { id: payment.id }, data: { drawerOperationId: operation.id } });
          drawerOperations.push(operation);
        }
        return { sale: existing, lines: existing.lines, ledgers: await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, referenceType: "SALE", referenceId: existing.id } }), drawerOperations };
      }
      const variantProductIds = new Map<string, string>();
      for (const item of req.items) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!v || v.tenantId !== ctx.tenantId || v.branchId !== ctx.branchId || (item.productId !== undefined && v.productId !== item.productId) || v.isActive === false) {
          throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
        }
        variantProductIds.set(item.variantId, v.productId);
      }
      // Resolve tax from the authoritative tenant/branch Settings row. Client tax values are
      // informational only; production financial fields must be derived server-side.
      const taxSettingRows = await tx.setting.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          scope: "BRANCH",
          key: "tax.config",
          isActive: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      });
      const taxConfigRow = (taxSettingRows[0]?.value || {}) as any;
      const taxEnabled = Boolean(taxConfigRow.vatEnabled);
      const configuredTaxRate = Number(taxConfigRow.vatRatePercent ?? 0);
      const taxConfig = {
        ratePct: Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0 && taxEnabled ? configuredTaxRate : 0,
        isInclusive: taxConfigRow.taxInclusivePricing !== false,
      };

      const lines = req.items.map((item: any) => {
        const c = PricingTaxEngine.calculateLineItem({
          unitPrice: item.unitPrice,
          unitCost: item.unitCost || 0,
          quantity: item.quantity,
          discount: item.discountAmount ? { type: "FIXED", value: item.discountAmount } : undefined,
          taxConfig,
        });
        return {
          id: crypto.randomUUID(),
          productId: item.productId ?? variantProductIds.get(item.variantId),
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: c.unitPrice,
          unitCost: c.unitCost,
          discountAmount: c.discountAmount,
          taxAmount: c.taxAmount,
          lineTotal: c.lineTotal,
        };
      });
      const totals = PricingTaxEngine.calculateSaleTotals(
        lines.map((l: any) => ({
          lineTotal: l.lineTotal,
          totalCost: l.unitCost * l.quantity,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
        })),
        req.discountTotal || 0,
      );
      const saleId = req.id || crypto.randomUUID(); const now = new Date();
      const saleNumber = `SAL-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const payments: any[] = [];
      for (const p of req.payments || []) {
        let customerCreditLimit: number | undefined;
        let customerCurrentBalance: number | undefined;
        if (p.paymentMethod === "CREDIT") {
          if (!req.customerId) throw new Error("CREDIT_CUSTOMER_REQUIRED");
          const customer = await tx.customer.findUnique({ where: { id: req.customerId } });
          if (!customer || customer.tenantId !== ctx.tenantId || customer.branchId !== ctx.branchId) throw new Error("CREDIT_CUSTOMER_BOUNDARY_VIOLATION");
          customerCreditLimit = Number(customer.creditLimit || 0);
          customerCurrentBalance = Number(customer.currentBalance || customer.outstandingBalance || 0);
        }
        const r = PaymentEngine.processPayment({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          provider: p.provider,
          providerReference: p.providerReference,
          customerId: req.customerId,
          customerCreditLimit,
          customerCurrentBalance,
        });
        if (!r.success) throw new Error(r.error || "PAYMENT_REJECTED");
        payments.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber: `PAY-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, amount: p.amount, paymentMethod: p.paymentMethod, provider: p.provider ?? null, providerReference: r.reference, status: "COMPLETED", paidAt: now }); }
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      if (totalPaid + 0.005 < totals.grandTotal) throw new Error("PAYMENT_UNDERPAYMENT");
      if (payments.some((p) => p.paymentMethod === "CASH")) {
        if (!req.cashSessionId) throw new Error("CASH_SESSION_REQUIRED");
        const session = await tx.cashSession.findUnique({ where: { id: req.cashSessionId } });
        if (!session || session.tenantId !== ctx.tenantId || session.branchId !== ctx.branchId || session.cashierId !== ctx.userId || session.status !== "OPEN") {
          throw new Error("CASH_SESSION_INVALID");
        }
      }
      const paymentStatus = PaymentEngine.evaluateSalePaymentStatus(totals.grandTotal, payments.map((p) => ({ amount: p.amount, status: p.status }))).paymentStatus;
      if (paymentStatus !== "PAID") throw new Error("PAYMENT_NOT_SETTLED");

      // Validate inventory before persisting the sale. Variant rows are locked for this transaction,
      // and the remaining-stock map handles duplicate lines for the same variant.
      const remainingStockByVariant = new Map<string, number>();
      for (const item of lines) {
        if (remainingStockByVariant.has(item.variantId)) continue;
        if (typeof (tx as any).$queryRawUnsafe === "function") {
          const lockRows = await (tx as any).$queryRawUnsafe(
            `SELECT id FROM product_variants WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE`,
            item.variantId,
            ctx.tenantId,
            ctx.branchId,
          ) as Array<{ id: string }>;
          if (!lockRows.length) throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
        }
        const ledgerRows = await tx.stockLedger.findMany({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: item.variantId },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        });
        const available = calculateAvailableStock(ledgerRows as any);
        remainingStockByVariant.set(item.variantId, available);
      }
      for (const item of lines) {
        const requested = Math.abs(item.quantity);
        const available = remainingStockByVariant.get(item.variantId) ?? 0;
        if (available < requested) {
          throw new Error(
            `INSUFFICIENT_STOCK: Cannot sell ${requested} units of variant ${item.variantId}; only ${available} available.`
          );
        }
        // Keep remainingStockByVariant unchanged until the inventory write loop.
      }

      const netRevenueBeforeTax = Math.max(0, Number(totals.grandTotal) - Number(totals.taxTotal));
      const authoritativeGrossProfit = Number((netRevenueBeforeTax - Number(totals.totalCost)).toFixed(2));
      const sale = await tx.sale.create({ data: { id: saleId, tenantId: ctx.tenantId, branchId: ctx.branchId, saleNumber, customerId: req.customerId ?? null, cashSessionId: req.cashSessionId ?? null, subtotal: netRevenueBeforeTax, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, grandTotal: totals.grandTotal, totalCost: totals.totalCost, grossProfit: authoritativeGrossProfit, status: "COMPLETED", paymentStatus, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: req.idempotencyKey, soldById: ctx.userId, soldAt: now, lines: { create: lines }, payments: { create: payments } }, include: { lines: true, payments: true } });

      // Persist drawer intent atomically with the payment. Hardware dispatch happens only after commit.
      const drawerOperations: any[] = [];
      const salePayments = Array.isArray(sale.payments) ? sale.payments : payments;
      for (const payment of salePayments.filter((p: any) => p.paymentMethod === "CASH" && p.status === "COMPLETED")) {
        const operation = await tx.drawerOperation.create({ data: {
          id: `drawer:${payment.id}`, tenantId: ctx.tenantId, branchId: ctx.branchId,
          cashSessionId: req.cashSessionId ?? null, paymentId: payment.id, saleId: sale.id,
          operationType: "PAYMENT", status: "PENDING", attempts: 0, deviceId: req.deviceId,
          requestedById: ctx.userId, metadata: { amount: Number(payment.amount), paymentMethod: payment.paymentMethod },
        } });
        await tx.payment.update({ where: { id: payment.id }, data: { drawerOperationId: operation.id } });
        drawerOperations.push(operation);
      }

      // Update inventory and stock ledgers atomically
      const ledgers: any[] = [];
      const impactedProductIds = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const qtySold = Math.abs(l.quantity);
        const qtyBefore = remainingStockByVariant.get(l.variantId) ?? 0;
        if (qtyBefore < qtySold) {
          throw new Error(
            `INVENTORY_RACE_DETECTED: Variant ${l.variantId} no longer has ${qtySold} units available.`
          );
        }
        const qtyAfter = qtyBefore - qtySold;
        remainingStockByVariant.set(l.variantId, qtyAfter);
        const ledger = await tx.stockLedger.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            productId: l.productId,
            variantId: l.variantId,
            movementType: "SALE",
            quantityChange: -qtySold,
            quantity: -qtySold,
            quantityBefore: qtyBefore,
            quantityAfter: qtyAfter,
            unitCost: l.unitCost || 0,
            totalCost: qtySold * (l.unitCost || 0),
            referenceType: "SALE",
            referenceId: sale.id,
            occurredAt: now,
            deviceId: req.deviceId,
            operationId: req.operationId,
            idempotencyKey: `${req.idempotencyKey}-${l.variantId}-${i}`,
            notes: `POS Sale ${sale.id}`,
          },
        });
        ledgers.push(ledger);

        await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, l.variantId);
        await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, l.variantId, null);
        impactedProductIds.add(l.productId);
      }

      for (const prodId of impactedProductIds) {
        await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, prodId);
      }

      const lookup = await this.accounts(tx, ctx);
      const tender = payments[0]?.paymentMethod === "BANK" ? "BANK" : payments[0]?.paymentMethod === "CREDIT" ? "CREDIT" : payments[0]?.paymentMethod === "MOBILE_MONEY" ? "MOBILE_MONEY" : "CASH";
      const built = FinancialBridge.mapSaleToJournal(ctx, sale as any, lookup as any, tender as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      await this.writeJournal(tx, ctx, built);
      return { sale, lines: sale.lines, ledgers, drawerOperations };
    });
  }

  async createPurchaseReceipt(ctx: TenantContext, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const supplier = await tx.supplier.findUnique({ where: { id: req.supplierId } }); if (!supplier || supplier.tenantId !== ctx.tenantId || supplier.branchId !== ctx.branchId) throw new Error("FINANCE_SUPPLIER_BOUNDARY_VIOLATION");
      for (const item of req.items) { const v = await tx.productVariant.findUnique({ where: { id: item.variantId } }); if (!v || v.tenantId !== ctx.tenantId || v.branchId !== ctx.branchId) throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION"); }
      const receiptId = req.id || crypto.randomUUID(); const now = new Date(); const number = TransactionNumbering.formatNumber("REC", "MAIN", (await tx.purchaseReceipt.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1); const total = req.items.reduce((s: number, i: any) => s + i.quantityReceived * i.unitCost, 0);
      const receipt = await tx.purchaseReceipt.create({ data: { id: receiptId, tenantId: ctx.tenantId, branchId: ctx.branchId, receiptNumber: number, purchaseOrderId: req.purchaseOrderId ?? null, supplierId: req.supplierId, receivedAt: now, createdById: ctx.userId, notes: req.notes ?? null, items: { create: req.items.map((i: any) => ({ id: crypto.randomUUID(), variantId: i.variantId, quantityReceived: i.quantityReceived, unitCost: i.unitCost, totalCost: i.quantityReceived * i.unitCost, batchNumber: i.batchNumber ?? null, expiryDate: i.expiryDate ? new Date(i.expiryDate) : null })) } }, include: { items: true } });
      await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { increment: total } } });

      const ledgers: any[] = [];
      const impactedProdIds = new Set<string>();

      for (let idx = 0; idx < req.items.length; idx++) {
        const i = req.items[idx];
        const item = receipt.items[idx];
        const qtyReceived = Math.abs(i.quantityReceived);
        await tx.$queryRawUnsafe(`SELECT id FROM product_variants WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE`, i.variantId, ctx.tenantId, ctx.branchId);
        const v = await tx.productVariant.findUnique({ where: { id: i.variantId } });
        const ledgerBefore = await tx.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: i.variantId } });
        const qtyBefore = Number(ledgerBefore._sum.quantityChange ?? 0);
        if (qtyBefore < 0) throw new Error("INSUFFICIENT_STOCK: stock ledger invariant violated");
        const qtyAfter = qtyBefore + qtyReceived;
        const prodId = v?.productId || item.variantId;

        const ledger = await tx.stockLedger.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            productId: prodId,
            variantId: i.variantId,
            movementType: "PURCHASE",
            quantityChange: qtyReceived,
            quantity: qtyReceived,
            quantityBefore: qtyBefore,
            quantityAfter: qtyAfter,
            unitCost: i.unitCost || 0,
            totalCost: qtyReceived * (i.unitCost || 0),
            referenceType: "PURCHASE_RECEIPT",
            referenceId: receipt.id,
            occurredAt: now,
            deviceId: req.deviceId,
            operationId: req.operationId,
            idempotencyKey: `${req.idempotencyKey}-${i.variantId}-${idx}`,
          },
        });
        ledgers.push(ledger);

        await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, i.variantId);
        await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, i.variantId, null);

        impactedProdIds.add(prodId);
      }

      for (const prodId of impactedProdIds) {
        await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, prodId);
      }

      const lookup = await this.accounts(tx, ctx); const built = FinancialBridge.mapGoodsReceiptToJournal(ctx, { ...(receipt as any), items: receipt.items.map((x: any) => ({ ...x, totalCost: Number(x.totalCost) })) }, lookup as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1); await this.writeJournal(tx, ctx, built);
      return { receipt, ledgers };
    });
  }

  private async lockExpense(tx: any, ctx: TenantContext, id: string) {
    const rows = await tx.$queryRawUnsafe(
      `SELECT id FROM expenses WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE`,
      id, ctx.tenantId, ctx.branchId,
    );
    if (!rows.length) throw new Error("EXPENSE_NOT_FOUND");
  }

  private async publishExpenseChange(tx: any, ctx: TenantContext, expense: any, operationType: "CREATE" | "UPDATE" | "DELETE", operationId: string, source = "expense-service") {
    if (!operationId || typeof tx?.$executeRawUnsafe !== "function") return;
    await tx.$executeRawUnsafe(
      `INSERT INTO sync_change_journal
        (tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source)
       VALUES ($1,$2,$3,'Expense',$4,$5,$6::jsonb,$7)
       ON CONFLICT (tenant_id, branch_id, operation_id) DO NOTHING`,
      ctx.tenantId, ctx.branchId, operationId, String(expense.id), operationType,
      JSON.stringify(expense ?? {}), source,
    );
  }

  private normalizeExpensePaymentMethod(value: unknown): "CASH" | "BANK" | "MOBILE_MONEY" | "CARD" {
    const v = String(value || "CASH").trim().toUpperCase().replace(/[ -]+/g, "_");
    if (v === "MPESA" || v === "M_PESA" || v === "MOBILEMONEY") return "MOBILE_MONEY";
    if (v === "BANK_TRANSFER") return "BANK";
    if (v === "CASH") return "CASH";
    if (v === "CARD") return "CARD";
    if (v === "BANK") return "BANK";
    if (v === "MOBILE_MONEY" || v === "AIRTEL_MONEY" || v === "TIGO_MONEY") return "MOBILE_MONEY";
    throw new Error("INVALID_EXPENSE_PAYMENT_METHOD");
  }

  private async resolveCashSession(tx: any, ctx: TenantContext, cashSessionId?: string, requireOpen = true) {
    const session = cashSessionId
      ? await tx.cashSession.findUnique({ where: { id: cashSessionId } })
      : await tx.cashSession.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, cashierId: ctx.userId, status: { in: ["OPEN", "ACTIVE", "CLOSE_REQUESTED"] } }, orderBy: { openedAt: "desc" } });
    if (!session) {
      if (cashSessionId) throw new Error("CASH_SESSION_NOT_FOUND");
      return null;
    }
    if (session.tenantId !== ctx.tenantId || session.branchId !== ctx.branchId) throw new Error("FINANCE_CASH_SESSION_BOUNDARY_VIOLATION");
    if (requireOpen && session.status === "CLOSED") throw new Error("CASH_SESSION_CLOSED");
    if (session.cashierId !== ctx.userId) throw new Error("CASH_SESSION_AUTHORIZATION_REQUIRED");
    return session;
  }

  private async postExpenseJournal(tx: any, ctx: TenantContext, expense: any, paymentMethod: string, journalSequence: number, reversal = false, reversalOfJournalId: string | null = null, reversalReason: string | null = null) {
    const lookup = await this.accounts(tx, ctx);
    const built = FinancialBridge.mapExpenseToJournal(
      ctx, expense as any, lookup.expenseDefaultAccountId, lookup as any,
      paymentMethod === "BANK" || paymentMethod === "MOBILE_MONEY" || paymentMethod === "CARD",
      journalSequence,
    );
    built.journal.isReversal = reversal;
    built.journal.reversalOfJournalId = reversalOfJournalId;
    built.journal.reversalReason = reversalReason;
    if (reversal) {
      built.journal.sourceType = "REVERSAL";
      built.journal.idempotencyKey = `jrn-exp-void-${expense.id}`;
    }
    return this.writeJournal(tx, ctx, built);
  }

  async recordExpense(ctx: TenantContext, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const id = req.id || randomUUID();
      const existing = await tx.expense.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          OR: [{ id }, ...(req.idempotencyKey ? [{ idempotencyKey: String(req.idempotencyKey) }] : [])],
        },
      });
      if (existing) {
        const incomingKey = String(req.idempotencyKey || id);
        const incomingFingerprint = JSON.stringify({
          category: req.category,
          amount: Number(req.amount),
          reason: req.reason,
          description: req.description || req.reason,
          payee: req.payee || "Unspecified Payee",
          paymentMethod: this.normalizeExpensePaymentMethod(req.paymentMethod),
          paymentRef: req.paymentRef || null,
          status: String(req.status || "PAID").toUpperCase(),
          taxDeductible: Boolean(req.taxDeductible),
          incurredAt: req.incurredAt || null,
        });
        const existingFingerprint = JSON.stringify({
          category: existing.category,
          amount: Number(existing.amount),
          reason: existing.reason,
          description: existing.description,
          payee: existing.payee,
          paymentMethod: existing.paymentMethod,
          paymentRef: existing.paymentRef || null,
          status: existing.status,
          taxDeductible: Boolean(existing.taxDeductible),
          incurredAt: existing.incurredAt?.toISOString?.() || existing.incurredAt || null,
        });
        if (String(existing.idempotencyKey) === incomingKey && incomingFingerprint !== existingFingerprint) {
          throw new Error("EXPENSE_IDEMPOTENCY_CONFLICT");
        }
        return existing;
      }

      const paymentMethod = this.normalizeExpensePaymentMethod(req.paymentMethod);
      const status = String(req.status || "PAID").toUpperCase();
      if (!["PENDING", "PAID"].includes(status)) throw new Error("INVALID_EXPENSE_STATUS");
      const cashSession = paymentMethod === "CASH" && status === "PAID"
        ? await this.resolveCashSession(tx, ctx, req.cashSessionId, true)
        : null;
      if (cashSession && cashSession.status === "CLOSED") throw new Error("CASH_SESSION_CLOSED");

      const now = new Date();
      const expense = await tx.expense.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          cashSessionId: status === "PAID" && paymentMethod === "CASH" ? (cashSession?.id ?? null) : null,
          category: req.category,
          amount: req.amount,
          reason: req.reason,
          description: req.description || req.reason,
          payee: req.payee || "Unspecified Payee",
          paymentMethod,
          paymentRef: req.paymentRef || null,
          status,
          taxDeductible: Boolean(req.taxDeductible),
          authorizedById: ctx.userId,
          paidById: status === "PAID" ? ctx.userId : null,
          paidAt: status === "PAID" ? now : null,
          idempotencyKey: String(req.idempotencyKey || id),
          incurredAt: req.incurredAt ? new Date(req.incurredAt) : now,
        },
      });

      if (status === "PAID") {
        if (cashSession) await tx.cashSession.update({ where: { id: cashSession.id }, data: { cashExpensesTotal: { increment: req.amount } } });
        await this.postExpenseJournal(tx, ctx, expense, paymentMethod, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      }

      await this.publishExpenseChange(tx, ctx, expense, "CREATE", String(req.operationId || expense.idempotencyKey));
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: req.deviceId || "web",
          action: "EXPENSE_RECORDED",
          entityType: "Expense",
          entityId: expense.id,
          metadata: { status, paymentMethod, amount: Number(req.amount), cashSessionId: cashSession?.id || null, idempotencyKey: expense.idempotencyKey },
        },
      });
      return expense;
    });
  }

  async getExpenses(ctx: TenantContext) {
    return this.db.expense.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
      orderBy: { incurredAt: "desc" },
    });
  }

  async payExpense(ctx: TenantContext, id: string, req: any) {
    return this.db.$transaction(async (tx: any) => {
      await this.lockExpense(tx, ctx, id);
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense || expense.tenantId !== ctx.tenantId || expense.branchId !== ctx.branchId) throw new Error("EXPENSE_NOT_FOUND");
      if (expense.status === "VOIDED") throw new Error("EXPENSE_ALREADY_VOIDED");
      if (expense.status === "PAID") return expense;

      const paymentMethod = this.normalizeExpensePaymentMethod(req.paymentMethod);
      const cashSession = paymentMethod === "CASH" ? await this.resolveCashSession(tx, ctx, req.cashSessionId, true) : null;
      const now = new Date();
      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: "PAID",
          paymentMethod,
          paymentRef: req.paymentRef || null,
          cashSessionId: cashSession?.id ?? null,
          paidById: ctx.userId,
          paidAt: now,
        },
      });
      if (cashSession) await tx.cashSession.update({ where: { id: cashSession.id }, data: { cashExpensesTotal: { increment: expense.amount } } });
      await this.postExpenseJournal(tx, ctx, updated, paymentMethod, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      await this.publishExpenseChange(tx, ctx, updated, "UPDATE", String(req.idempotencyKey || id));
      await tx.auditEvent.create({
        data: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
          deviceId: req.deviceId || "web", action: "EXPENSE_PAID", entityType: "Expense", entityId: id,
          metadata: { paymentMethod, amount: Number(expense.amount), paymentRef: req.paymentRef || null, cashSessionId: cashSession?.id || null, idempotencyKey: req.idempotencyKey || null },
        },
      });
      return updated;
    });
  }

  async voidExpense(ctx: TenantContext, id: string, reason: string, req: any = {}) {
    return this.db.$transaction(async (tx: any) => {
      await this.lockExpense(tx, ctx, id);
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense || expense.tenantId !== ctx.tenantId || expense.branchId !== ctx.branchId) throw new Error("EXPENSE_NOT_FOUND");
      if (expense.status === "VOIDED") return expense;
      const now = new Date();

      if (expense.status === "PAID") {
        if (expense.cashSessionId) {
          const session = await tx.cashSession.findUnique({ where: { id: expense.cashSessionId } });
          if (!session || session.tenantId !== ctx.tenantId || session.branchId !== ctx.branchId) throw new Error("FINANCE_CASH_SESSION_BOUNDARY_VIOLATION");
          if (session.status === "CLOSED") throw new Error("CANNOT_VOID_CLOSED_CASH_SESSION_EXPENSE");
          await tx.cashSession.update({ where: { id: session.id }, data: { cashExpensesTotal: { decrement: expense.amount } } });
        }

        const original = await tx.journalEntry.findFirst({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, sourceType: "EXPENSE", sourceId: id, isReversal: false },
          include: { lines: true },
        });
        if (!original) throw new Error("EXPENSE_SOURCE_JOURNAL_NOT_FOUND");

        const built = {
          journal: {
            id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId,
            journalNumber: TransactionNumbering.formatNumber("JRN", "MAIN", (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1),
            entryDate: now.toISOString(), postingDate: now.toISOString(), sourceType: "REVERSAL", sourceId: id,
            description: `Void Expense: ${expense.category}`, currency: "TZS", exchangeRate: 1,
            totalDebit: Number(original.totalCredit), totalCredit: Number(original.totalDebit),
            status: "POSTED", isReversal: true, reversalOfJournalId: original.id, reversalReason: reason,
            idempotencyKey: `jrn-exp-void-${id}`,
          },
          lines: original.lines.map((line: any) => ({
            id: randomUUID(), accountId: line.accountId, description: `Reversal: ${line.description || "Expense"}`,
            debit: Number(line.credit), credit: Number(line.debit), currency: line.currency, exchangeRate: Number(line.exchangeRate || 1),
          })),
        };
        await this.writeJournal(tx, ctx, built);
        await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED" } });
      }

      const updated = await tx.expense.update({
        where: { id },
        data: { status: "VOIDED", voidedById: ctx.userId, voidedAt: now, voidReason: reason },
      });
      await this.publishExpenseChange(tx, ctx, updated, "UPDATE", String(req.idempotencyKey || id));
      await tx.auditEvent.create({
        data: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
          deviceId: req.deviceId || "web", action: "EXPENSE_VOIDED", entityType: "Expense", entityId: id,
          metadata: { reason, priorStatus: expense.status, idempotencyKey: req.idempotencyKey || null },
        },
      });
      return updated;
    });
  }
}
