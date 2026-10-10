import { randomUUID } from "node:crypto";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { AccountingEngine, FinancialBridge, PricingTaxEngine, PaymentEngine, CashSessionEngine, TransactionNumbering, assertBackdatingThreshold, assertSaleBackdatingPermission, calculateAvailableStock, validateRetroactiveTimeline } from "@kwakopos2/domain";
import { projectProductBranchStock, projectProductStockSummary, projectVariantInventory } from "./inventoryAuthority.js";
import { PricingAuthority } from "./pricingAuthority.js";
import { resolveBundleDefinition } from "./bundleInventory.js";

export class PrismaAtomicCommercialFinanceService {
  constructor(private readonly db: any = prisma) {}

  async accounts(tx: any, ctx: TenantContext) {
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

  async writeJournal(tx: any, ctx: TenantContext, built: any) {
    const journalIdempotencyKey = String(built.journal.idempotencyKey || "").trim();
    const existing = journalIdempotencyKey && typeof tx.journalEntry.findFirst === "function"
      ? await tx.journalEntry.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: journalIdempotencyKey } }).catch(() => null)
      : null;
    if (existing) {
      if (existing.sourceType !== built.journal.sourceType || (existing.sourceId ?? null) !== (built.journal.sourceId ?? null)) {
        throw new Error("JOURNAL_IDEMPOTENCY_CONFLICT");
      }
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

  async reversePayment(ctx: TenantContext, paymentId: string, reason: string) {
    return this.db.$transaction((tx: any) => this.reversePaymentInTransaction(ctx, paymentId, reason, tx));
  }

  async refundPayment(ctx: TenantContext, paymentId: string, request: {
    amount: number; reason: string; refundMethod: string; provider?: string; providerReference?: string; idempotencyKey: string;
  }) {
    return this.db.$transaction((tx: any) => this.refundPaymentInTransaction(ctx, paymentId, request, tx));
  }
  async getFinancialAccountLookup(ctx: TenantContext, tx: any = this.db) {
    return this.accounts(tx, ctx);
  }

  async postFinancialJournal(ctx: TenantContext, built: any, tx: any = this.db) {
    return this.writeJournal(tx, ctx, built);
  }

  async reversePaymentInTransaction(ctx: TenantContext, paymentId: string, reason: string, tx: any) {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.isRefund) throw new Error("PAYMENT_REFUND_CANNOT_BE_REVERSED_AS_ORIGINAL");
    if (payment.saleId) throw new Error("PAYMENT_SALE_REVERSAL_REQUIRES_RETURN");
    const existingReversal = await tx.payment.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, reversalOfPaymentId: payment.id, isRefund: false },
    });
    if (existingReversal) return existingReversal;
    if (payment.reversedAt || payment.status === "REVERSED") throw new Error("PAYMENT_REVERSAL_ALREADY_RECORDED");
    if (payment.status !== "COMPLETED") throw new Error("PAYMENT_REVERSAL_REQUIRES_COMPLETED_PAYMENT");

    const originalJournal = await tx.journalEntry.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, sourceType: "PAYMENT", sourceId: payment.id, status: "POSTED" },
      include: { lines: true },
    });
    if (!originalJournal || !originalJournal.lines?.length) throw new Error("PAYMENT_REVERSAL_JOURNAL_NOT_FOUND");
    const journalNumber = `REV-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const built = AccountingEngine.createReversalJournal(ctx, originalJournal as any, originalJournal.lines as any, reason, journalNumber);
    await this.writeJournal(tx, ctx, { journal: built.reversalJournal, lines: built.reversalLines });

    const now = new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REVERSED", reversalReason: reason, reversedAt: now, reversedById: ctx.userId },
    });
    const reversal = await tx.payment.create({
      data: {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        paymentNumber: `REV-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        purchaseReceiptId: payment.purchaseReceiptId,
        customerId: payment.customerId,
        supplierId: payment.supplierId,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        provider: payment.provider,
        providerReference: payment.providerReference,
        status: "REVERSED",
        reconciliationStatus: "MATCHED",
        reversalOfPaymentId: payment.id,
        reversalReason: reason,
        reversedAt: now,
        reversedById: ctx.userId,
        idempotencyKey: `PAYMENT-REVERSAL-${payment.id}`,
        paidAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "payment-sync", action: "PAYMENT_REVERSED", entityType: "Payment", entityId: payment.id,
        metadata: { reversalPaymentId: reversal.id, reason, reversalJournalId: built.reversalJournal.id },
      },
    });
    return reversal;
  }
  async refundPaymentInTransaction(ctx: TenantContext, paymentId: string, request: {
    amount: number; reason: string; refundMethod: string; provider?: string; providerReference?: string; idempotencyKey: string;
  }, tx: any) {
    const idempotencyKey = String(request.idempotencyKey || "").trim();
    if (!idempotencyKey) throw new Error("PAYMENT_REFUND_IDEMPOTENCY_KEY_REQUIRED");
    const existingRefund = await tx.payment.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey } }).catch(() => null);
    if (existingRefund) {
      if (!existingRefund.isRefund || existingRefund.reversalOfPaymentId !== paymentId ||
          existingRefund.tenantId !== ctx.tenantId || existingRefund.branchId !== ctx.branchId) {
        throw new Error("PAYMENT_REFUND_IDEMPOTENCY_CONFLICT");
      }
      return existingRefund;
    }

    const original = await tx.payment.findFirst({ where: { id: paymentId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!original) throw new Error("PAYMENT_NOT_FOUND");
    if (original.isRefund || original.reversedAt || original.status !== "COMPLETED") throw new Error("PAYMENT_REFUND_REQUIRES_COMPLETED_ORIGINAL");
    if (original.saleId) throw new Error("PAYMENT_SALE_REFUND_REQUIRES_RETURN");
    const amount = Number(request.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("PAYMENT_REFUND_AMOUNT_INVALID");
    const priorRefunds = await tx.payment.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, reversalOfPaymentId: paymentId, isRefund: true },
      select: { amount: true },
    });
    const alreadyRefunded = priorRefunds.reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const remaining = Number(original.amount) - alreadyRefunded;
    if (amount > remaining + 0.000001) throw new Error("PAYMENT_REFUND_EXCEEDS_REMAINING_AMOUNT");

    const originalJournal = await tx.journalEntry.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, sourceType: "PAYMENT", sourceId: original.id },
      include: { lines: true },
    });
    if (!originalJournal || !originalJournal.lines?.length) throw new Error("PAYMENT_REFUND_JOURNAL_NOT_FOUND");
    const ratio = amount / Number(original.amount);
    const refundId = randomUUID();
    const refundPayment = await tx.payment.create({
      data: {
        id: refundId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        paymentNumber: `REF-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        saleId: original.saleId,
        purchaseReceiptId: original.purchaseReceiptId,
        customerId: original.customerId,
        supplierId: original.supplierId,
        amount,
        paymentMethod: request.refundMethod,
        provider: request.provider || original.provider,
        providerReference: request.providerReference || null,
        status: "REFUNDED",
        isRefund: true,
        reversalOfPaymentId: original.id,
        refundReason: request.reason,
        refundMethod: request.refundMethod,
        refundProvider: request.provider || original.provider,
        refundProviderReference: request.providerReference || null,
        idempotencyKey,
        paidAt: new Date(),
        reconciliationStatus: "MATCHED",
        reconciliationReference: request.providerReference || null,
      },
    });

    const built = AccountingEngine.createJournalEntry(ctx, {
      journalNumber: `JRN-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`,
      sourceType: "REVERSAL",
      sourceId: refundId,
      description: `Refund of payment ${original.paymentNumber}: ${request.reason}`,
      idempotencyKey: `jrn-pay-refund-${idempotencyKey}`,
      lines: originalJournal.lines.map((line: any) => ({
        accountId: line.accountId,
        costCenterId: line.costCenterId ?? undefined,
        description: `Refund: ${line.description || original.paymentNumber}`,
        debit: Number((Number(line.credit) * ratio).toFixed(2)),
        credit: Number((Number(line.debit) * ratio).toFixed(2)),
      })),
    });
    built.journal.isReversal = true;
    built.journal.reversalOfJournalId = originalJournal.id;
    built.journal.reversalReason = request.reason;
    await this.writeJournal(tx, ctx, built);
    const totalRefunded = alreadyRefunded + amount;
    const originalPaymentStatus = totalRefunded >= Number(original.amount) - 0.000001 ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.payment.update({
      where: { id: original.id },
      data: { refundedAmount: totalRefunded, status: originalPaymentStatus },
    });
    await tx.auditEvent.create({
      data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "payment-sync", action: "PAYMENT_REFUNDED", entityType: "Payment", entityId: original.id,
        metadata: { originalPaymentId: original.id, refundPaymentId: refundId, amount, reason: request.reason, idempotencyKey },
      },
    });
    return refundPayment;
  }

  async confirmProviderPaymentInTransaction(ctx: TenantContext, paymentId: string, request: {
    amount: number; provider?: string; providerReference?: string; providerEventId?: string; externalReference?: string;
  }, tx: any) {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    const eventId = String(request.providerEventId || "").trim();
    const provider = String(request.provider || "").trim();
    const reference = String(request.providerReference || request.externalReference || "").trim();
    if (!eventId || !provider || !reference) throw new Error("PAYMENT_PROVIDER_CONFIRMATION_EVIDENCE_REQUIRED");
    const existingEvent = await tx.payment.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, providerEventId: eventId },
    });
    if (existingEvent && existingEvent.id !== payment.id) throw new Error("PAYMENT_PROVIDER_EVENT_REPLAY");
    if (existingEvent && payment.status === "COMPLETED") return payment;
    if (!Number.isFinite(Number(request.amount)) || Math.abs(Number(request.amount) - Number(payment.amount)) > 0.005) {
      throw new Error("PAYMENT_PROVIDER_AMOUNT_MISMATCH");
    }
    if (payment.provider && String(payment.provider).toUpperCase() !== provider.toUpperCase()) throw new Error("PAYMENT_PROVIDER_MISMATCH");
    if (payment.status !== "PENDING" && payment.status !== "COMPLETED") throw new Error("PAYMENT_PROVIDER_CONFIRMATION_INVALID_STATUS");

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        provider,
        providerReference: reference,
        providerEventId: eventId,
        providerVerifiedAt: new Date(),
        status: "COMPLETED",
        paidAt: new Date(),
        reconciliationStatus: "MATCHED",
        reconciliationReference: reference,
        reconciledAt: new Date(),
      },
    });
    const existingJournal = await tx.journalEntry.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, sourceType: "PAYMENT", sourceId: payment.id },
    });
    if (!existingJournal && (updated.customerId || updated.supplierId)) {
      const lookup = await this.accounts(tx, ctx);
      const built = updated.customerId
        ? FinancialBridge.mapCustomerPaymentToJournal(ctx, updated as any, lookup as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1)
        : FinancialBridge.mapSupplierPaymentToJournal(ctx, updated as any, lookup as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      await this.writeJournal(tx, ctx, built);
    }
    await tx.auditEvent.create({
      data: {
        id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
        deviceId: "payment-sync", action: "PAYMENT_PROVIDER_CONFIRMED", entityType: "Payment", entityId: payment.id,
        metadata: { provider, providerEventId: eventId, providerReference: reference, amount: Number(payment.amount) },
      },
    });
    return updated;
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
      const pricingEvidence: any[] = [];
      const variantProductIds = new Map<string, string>();
      const variantPrices = new Map<string, number>();
      const variantCosts = new Map<string, number>();
      const bundleResolutions = new Map<string, Awaited<ReturnType<typeof resolveBundleDefinition>>>();
      let saleDiscountRequested = Number(req.discountTotal || 0) > 0;
      for (const item of req.items) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!v || v.tenantId !== ctx.tenantId || v.branchId !== ctx.branchId || (item.productId !== undefined && v.productId !== item.productId) || v.isActive === false) {
          throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
        }
        const pricingResolution = await PricingAuthority.resolveUnitPrice(tx, ctx, {
          variantId: item.variantId,
          productId: item.productId,
          customerId: req.customerId,
          quantity: Number(item.quantity),
          requestedUnitPrice: Number(item.unitPrice),
          priceListId: req.priceListId,
          priceOverrideReason: req.priceOverrideReason,
        });
        const authoritativePrice = pricingResolution.unitPrice;
        pricingEvidence.push({
          variantId: pricingResolution.variantId,
          productId: pricingResolution.productId,
          source: pricingResolution.source,
          sourceId: pricingResolution.sourceId ?? null,
          customerPriceId: pricingResolution.customerPriceId ?? null,
          priceListItemId: pricingResolution.priceListItemId ?? null,
          pricingTierId: pricingResolution.pricingTierId ?? null,
          promotionId: pricingResolution.promotionId ?? null,
          promotionalBasePrice: pricingResolution.promotionalBasePrice ?? null,
          resolvedUnitPrice: pricingResolution.unitPrice,
          requestedUnitPrice: pricingResolution.requestedUnitPrice ?? null,
          overrideApplied: pricingResolution.overrideApplied,
          overrideReason: pricingResolution.overrideReason ?? null,
        });
        if (Number(item.discountAmount || 0) > 0) saleDiscountRequested = true;
        const resolution = bundleResolutions.get(item.variantId) || await resolveBundleDefinition(tx, ctx.tenantId, ctx.branchId, item.variantId);
        if (resolution.isBundle && item.bundleDefinitionVersion) {
          const serverDefinitionVersion = resolution.definitionVersion;
          if (String(item.bundleDefinitionVersion) !== String(serverDefinitionVersion)) {
            throw new Error("BUNDLE_DEFINITION_CHANGED_OFFLINE");
          }
        }
        if (resolution.isBundle && item.bundleComponents) {
          const expected = resolution.components.map((component) => ({
            variantId: component.variantId,
            productId: component.productId,
            quantity: component.quantity,
          }));
          const actual = item.bundleComponents.map((component: any) => ({
            variantId: String(component.variantId),
            productId: String(component.productId),
            quantity: Number(component.quantity),
          }));
          if (JSON.stringify(expected) !== JSON.stringify(actual)) {
            throw new Error("BUNDLE_DEFINITION_CHANGED_OFFLINE");
          }
        }
        bundleResolutions.set(item.variantId, resolution);
        variantProductIds.set(item.variantId, v.productId);
        variantPrices.set(item.variantId, authoritativePrice);
        variantCosts.set(item.variantId, resolution.unitCost);
      }
      if (saleDiscountRequested) {
        const permissions = Array.isArray(ctx.permissions) ? ctx.permissions.map((p: any) => String(p).trim().toLowerCase()) : [];
        const roles = Array.isArray(ctx.roles) ? ctx.roles.map((r: any) => String(r).toUpperCase()) : [];
        const allowed = permissions.includes("*") || permissions.includes("discount.manage") || permissions.includes("sales.discount") || roles.some((r: string) => ["ADMIN","OWNER","SUPER_ADMIN","SUPERADMIN","MANAGER","BRANCH_MANAGER"].includes(r));
        if (!allowed) throw new Error("DISCOUNT_MANAGE_REQUIRED");
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
      let authoritativeTax: any = null;
      if (taxEnabled) {
        const taxId = typeof taxConfigRow.taxId === "string" ? taxConfigRow.taxId : "";
        authoritativeTax = taxId
          ? await tx.tax.findFirst({
              where: { id: taxId, tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true },
            })
          : null;
        const taxCode = String(taxConfigRow.taxCode || "VAT").trim().toUpperCase();
        if (!authoritativeTax) {
          authoritativeTax = await tx.tax.findFirst({
            where: { tenantId: ctx.tenantId, branchId: ctx.branchId, code: taxCode, isActive: true },
          });
        }
        if (!authoritativeTax) {
          const rate = Number(taxConfigRow.vatRatePercent ?? 0);
          if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("SALE_TAX_RATE_INVALID");
          authoritativeTax = await tx.tax.upsert({
            where: { tenantId_branchId_code: { tenantId: ctx.tenantId, branchId: ctx.branchId, code: taxCode } },
            create: {
              id: crypto.randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId,
              name: String(taxConfigRow.taxName || "VAT"), code: taxCode, rate,
              isInclusive: taxConfigRow.taxInclusivePricing !== false, isActive: true,
            },
            update: {
              name: String(taxConfigRow.taxName || "VAT"), rate,
              isInclusive: taxConfigRow.taxInclusivePricing !== false, isActive: true,
            },
          });
        }
      }
      const configuredTaxRate = authoritativeTax ? Number(authoritativeTax.rate) : 0;
      const taxConfig = {
        ratePct: Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0 && taxEnabled ? configuredTaxRate : 0,
        isInclusive: authoritativeTax ? Boolean(authoritativeTax.isInclusive) : true,
      };

      const lines = req.items.map((item: any) => {
        const c = PricingTaxEngine.calculateLineItem({
          unitPrice: Number(variantPrices.get(item.variantId) ?? item.unitPrice),
          unitCost: Number(variantCosts.get(item.variantId) ?? 0),
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
        taxConfig,
      );
      if (Number(totals.grandTotal) <= 0) throw new Error("SALE_TOTAL_ZERO");
      const saleId = req.id || crypto.randomUUID(); const now = new Date();
      const occurredAt = req.occurredAt ? new Date(req.occurredAt) : now;
      const isBackdated = Boolean(req.isBackdated || (req.occurredAt && Math.abs(now.getTime() - occurredAt.getTime()) > 5 * 60 * 1000));
      if (req.isBackdated && !req.occurredAt) throw new Error("BACKDATED_SALE_DATE_REQUIRED");
      if (isBackdated) {
        assertSaleBackdatingPermission(ctx);
        assertBackdatingThreshold(occurredAt);
        const closedPeriod = await tx.accountingPeriod.findFirst({
          where: { tenantId: ctx.tenantId, startDate: { lte: occurredAt }, endDate: { gte: occurredAt }, status: { in: ["CLOSED", "LOCKED"] } },
        });
        if (closedPeriod) {
          const code = closedPeriod.status === "LOCKED" ? "ACCOUNTING_PERIOD_LOCKED" : "ACCOUNTING_PERIOD_CLOSED";
          throw new Error(`${code}: Cannot backdate sale into accounting period "${closedPeriod.name}".`);
        }
      }
      // Reserve and validate all physical stock components before payment processing or sale creation.
      // Row locks are ordered by variant ID to keep concurrent multi-item sales from deadlocking.
      const requestedByVariant = new Map<string, { productId: string; quantity: number }>();
      for (const item of req.items) {
        const itemQuantity = Number(item.quantity);
        if (!Number.isFinite(itemQuantity) || itemQuantity <= 0) throw new Error("SALE_QUANTITY_INVALID");
        const resolution = bundleResolutions.get(item.variantId);
        const components = resolution?.isBundle
          ? resolution.components.map((component) => ({
              variantId: String(component.variantId),
              productId: String(component.productId),
              quantity: Number(component.quantity) * itemQuantity,
            }))
          : [{
              variantId: String(item.variantId),
              productId: String(item.productId ?? variantProductIds.get(item.variantId)),
              quantity: itemQuantity,
            }];

        for (const component of components) {
          if (!Number.isFinite(component.quantity) || component.quantity <= 0 || !component.productId || component.productId === "undefined") {
            throw new Error("SALE_STOCK_COMPONENT_INVALID");
          }
          const existingRequirement = requestedByVariant.get(component.variantId);
          if (existingRequirement && existingRequirement.productId !== component.productId) {
            throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
          }
          requestedByVariant.set(component.variantId, {
            productId: component.productId,
            quantity: (existingRequirement?.quantity ?? 0) + component.quantity,
          });
        }
      }

      for (const [variantId, requirement] of [...requestedByVariant.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (typeof tx.$queryRawUnsafe === "function") {
          const lockRows = await tx.$queryRawUnsafe(
            `SELECT id FROM product_variants WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE`,
            variantId,
            ctx.tenantId,
            ctx.branchId,
          ) as Array<{ id: string }>;
          if (!Array.isArray(lockRows) || lockRows.length === 0) throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
        }

        const lockedVariant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (
          !lockedVariant ||
          lockedVariant.tenantId !== ctx.tenantId ||
          lockedVariant.branchId !== ctx.branchId ||
          lockedVariant.productId !== requirement.productId ||
          lockedVariant.isActive === false
        ) {
          throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
        }

        const ledgerRows = await tx.stockLedger.findMany({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId },
          orderBy: { occurredAt: "asc" },
        });
        const currentStock = calculateAvailableStock(ledgerRows as any);
        if (!Number.isFinite(currentStock) || currentStock < 0) {
          throw new Error("INSUFFICIENT_STOCK: stock ledger invariant violated");
        }

        if (isBackdated) {
          const historicalRows = ledgerRows.filter((row: any) => new Date(row.occurredAt || row.createdAt).getTime() < occurredAt.getTime());
          const historicalStock = calculateAvailableStock(historicalRows as any);
          if (historicalStock < requirement.quantity) {
            throw new Error(`INSUFFICIENT_STOCK: requested ${requirement.quantity}, only ${historicalStock} available at the backdated sale time`);
          }
          const validation = validateRetroactiveTimeline(ledgerRows as any, occurredAt, -requirement.quantity);
          if (!validation.valid) {
            throw new Error(`INSUFFICIENT_STOCK: Backdated sale would cause stock to drop below zero on ${validation.violationDate} (balance: ${validation.lowestIntermediateBalance}).`);
          }
        } else {
          // Forward/offline sales may oversell, but the ledger and conflict audit below must record the shortfall.
        }
      }
      const saleNumber = `SAL-${occurredAt.toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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
        payments.push({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          paymentNumber: `PAY-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          provider: p.provider ?? null,
          providerReference: r.reference,
          providerVerifiedAt: p.paymentMethod === "CASH" || p.providerReference ? new Date() : null,
          reconciliationStatus: p.paymentMethod === "CASH" || p.providerReference ? "MATCHED" : "UNRECONCILED",
          reconciliationReference: p.providerReference ?? null,
          status: "COMPLETED",
          paidAt: occurredAt,
        });
      }
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      if (totalPaid > Number(totals.grandTotal) + 0.005) throw new Error("PAYMENT_OVERPAYMENT");
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

      const netRevenueBeforeTax = Math.max(0, Number(totals.grandTotal) - Number(totals.taxTotal));
      const authoritativeGrossProfit = Number((netRevenueBeforeTax - Number(totals.totalCost)).toFixed(2));
      const sale = await tx.sale.create({ data: { id: saleId, tenantId: ctx.tenantId, branchId: ctx.branchId, saleNumber, customerId: req.customerId ?? null, cashSessionId: req.cashSessionId ?? null, subtotal: netRevenueBeforeTax, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, grandTotal: totals.grandTotal, totalCost: totals.totalCost, grossProfit: authoritativeGrossProfit, status: "COMPLETED", paymentStatus, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: req.idempotencyKey, soldById: ctx.userId, soldAt: occurredAt, lines: { create: lines }, payments: { create: payments } }, include: { lines: true, payments: true } });

      if (payments.some((p: any) => p.paymentMethod === "CREDIT") && req.customerId) {
        await tx.customer.update({ where: { id: req.customerId }, data: { currentBalance: { increment: Number(sale.grandTotal) } } });
      }
      await tx.auditEvent.create({
        data: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId, deviceId: req.deviceId,
          action: "SALE_CREATED", entityType: "Sale", entityId: sale.id,
          metadata: {
            operationId: req.operationId,
            idempotencyKey: req.idempotencyKey,
            soldAt: occurredAt.toISOString(),
            isBackdated,
            pricing: pricingEvidence,
            pricingPolicy: {
              precedence: ["CUSTOMER","PROMOTION","WHOLESALE","BULK","BRANCH","PRICE_LIST","BASE"],
              taxRatePct: taxConfig.ratePct,
              taxInclusive: taxConfig.isInclusive,
            },
          },
        },
      });
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

      // Update component inventory and StockLedger atomically. Bundle parents are virtual sale units;
      // only their resolved physical components affect stock.
      const ledgers: any[] = [];
      const impactedProductIds = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const resolution = bundleResolutions.get(l.variantId);
        const inventoryItems = resolution?.isBundle
          ? resolution.components.map((component) => ({
              variantId: component.variantId,
              productId: component.productId,
              quantity: Number(l.quantity) * component.quantity,
              unitCost: component.unitCost,
            }))
          : [{
              variantId: l.variantId,
              productId: l.productId,
              quantity: Number(l.quantity),
              unitCost: Number(l.unitCost || 0),
            }];

        for (let componentIndex = 0; componentIndex < inventoryItems.length; componentIndex++) {
          const component = inventoryItems[componentIndex];
          const qtySold = Math.abs(Number(component.quantity));
          if (!Number.isFinite(qtySold) || qtySold <= 0) continue;

          if (typeof (tx as any).$queryRawUnsafe === "function") {
            const lockRows = await (tx as any).$queryRawUnsafe(
              `SELECT id FROM product_variants WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE`,
              component.variantId,
              ctx.tenantId,
              ctx.branchId,
            ) as Array<{ id: string }>;
            if (!lockRows.length) throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
          }

          const variantBefore = await tx.productVariant.findUnique({ where: { id: component.variantId } });
          if (!variantBefore || variantBefore.tenantId !== ctx.tenantId || variantBefore.branchId !== ctx.branchId || variantBefore.productId !== component.productId) {
            throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
          }

          const ledgerRows = await tx.stockLedger.findMany({
            where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: component.variantId },
            orderBy: { occurredAt: "asc" },
          });
          const currentStock = calculateAvailableStock(ledgerRows as any);
          const historicalRows = isBackdated ? ledgerRows.filter((row: any) => new Date(row.occurredAt || row.createdAt).getTime() < occurredAt.getTime()) : [];
          const historicalStock = isBackdated ? calculateAvailableStock(historicalRows as any) : currentStock;
          const qtyBefore = isBackdated ? historicalStock : currentStock;
          if (qtyBefore < 0) throw new Error("INSUFFICIENT_STOCK: stock ledger invariant violated");

          if (isBackdated) {
            const validation = validateRetroactiveTimeline(ledgerRows as any, occurredAt, -qtySold);
            if (!validation.valid) throw new Error(`INSUFFICIENT_STOCK: Backdated sale would cause stock to drop below zero on ${validation.violationDate} (balance: ${validation.lowestIntermediateBalance}).`);
          }

          const isOversell = !isBackdated && qtyBefore < qtySold;
          const shortfall = isOversell ? qtySold - qtyBefore : 0;
          const qtyAfter = isBackdated ? qtyBefore - qtySold : Math.max(0, qtyBefore - qtySold);

          if (isOversell) {
            const conflictId = `conflict:oversell:${saleId}:${component.variantId}`;
            try {
              await tx.$executeRawUnsafe(
                `INSERT INTO sync_conflict_record (id, tenant_id, branch_id, operation_id, entity_type, entity_id, local_payload, remote_payload, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'OPEN')
                 ON CONFLICT (id) DO NOTHING`,
                conflictId,
                ctx.tenantId,
                ctx.branchId,
                req.operationId || saleId,
                "SaleOversell",
                component.variantId,
                JSON.stringify({ saleId, variantId: component.variantId, productId: component.productId, qtySold, qtyBefore, shortfall, bundleVariantId: resolution?.isBundle ? l.variantId : null }),
                JSON.stringify({ currentInventory: qtyBefore }),
              );
            } catch {
              throw new Error("SYNC_CONFLICT_PERSISTENCE_UNAVAILABLE");
            }
            await tx.auditEvent.create({
              data: {
                id: randomUUID(),
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                userId: ctx.userId,
                deviceId: req.deviceId || "sync-engine",
                action: "SYNC_CONFLICT_DETECTED",
                entityType: "SaleOversell",
                entityId: component.variantId,
                metadata: {
                  conflictId,
                  operationId: req.operationId || saleId,
                  saleId,
                  variantId: component.variantId,
                  qtySold,
                  qtyBefore,
                  shortfall,
                  bundleVariantId: resolution?.isBundle ? l.variantId : null,
                  source: "oversell",
                },
              },
            });
            if (resolution?.isBundle) throw new Error(`INSUFFICIENT_BUNDLE_COMPONENT_STOCK:${component.variantId}`);
          }

          const bundleSnapshot = resolution?.isBundle
            ? {
                parentLineId: l.id,
                parentVariantId: l.variantId,
                definitionVersion: resolution.definitionVersion,
                components: resolution.components,
              }
            : null;
          const notes = bundleSnapshot
            ? `BUNDLE_SALE:${JSON.stringify(bundleSnapshot)}`
            : (isOversell ? `POS Sale ${saleId} (OVERSELL DETECTED: shortfall ${shortfall})` : `POS Sale ${saleId}`);

          const ledger = await tx.stockLedger.create({
            data: {
              id: randomUUID(),
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              productId: component.productId,
              variantId: component.variantId,
              movementType: "SALE",
              quantityChange: -qtySold,
              quantity: -qtySold,
              quantityBefore: qtyBefore,
              quantityAfter: qtyAfter,
              unitCost: component.unitCost || 0,
              totalCost: qtySold * (component.unitCost || 0),
              referenceType: "SALE",
              referenceId: sale.id,
              occurredAt,
              deviceId: req.deviceId,
              operationId: req.operationId,
              idempotencyKey: `${req.idempotencyKey}-${l.id}-${component.variantId}-${componentIndex}`,
              notes,
            },
          });
          ledgers.push(ledger);

          await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, component.variantId);
          await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, component.variantId, null);
          impactedProductIds.add(component.productId);
        }
      }

      for (const prodId of impactedProductIds) {
        await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, prodId);
      }

      const lookup = await this.accounts(tx, ctx);
      const built = FinancialBridge.mapSaleToJournal(
        ctx,
        sale as any,
        lookup as any,
        (sale.payments || payments) as any,
        (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1,
      );
      await this.writeJournal(tx, ctx, built);
      if (typeof tx.$executeRawUnsafe === "function") {
        await tx.$executeRawUnsafe(
          "INSERT INTO sync_change_journal (tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source) VALUES ($1,$2,$3,'Sale',$4,'CREATE',$5::jsonb,'sale-service') ON CONFLICT (tenant_id, branch_id, operation_id) DO NOTHING",
          ctx.tenantId,
          ctx.branchId,
          req.operationId,
          sale.id,
          JSON.stringify(sale),
        );
      }
      return { sale, lines: sale.lines, ledgers, drawerOperations };
    });
  }

  async voidSale(ctx: TenantContext, saleId: string, reason: string, req: any = {}) {
    return this.db.$transaction(async (tx: any) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, tenantId: ctx.tenantId, branchId: ctx.branchId },
        include: { lines: true, payments: true },
      });
      if (!sale) throw new Error("SALE_NOT_FOUND");
      if (sale.status === "CANCELLED") return { sale, alreadyVoided: true };
      if (sale.status !== "COMPLETED") throw new Error("SALE_INVALID_VOID_STATE");

      for (const line of sale.lines) {
        const rows = await tx.stockLedger.findMany({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: line.variantId },
          orderBy: { occurredAt: "asc" },
        });
        const before = calculateAvailableStock(rows as any);
        const key = "SALE-VOID-" + sale.id + "-" + line.variantId;
        const existing = await tx.stockLedger.findFirst({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: key },
        });
        if (existing) continue;
        const quantity = Math.abs(Number(line.quantity));
        await tx.stockLedger.create({
          data: {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            productId: line.productId,
            variantId: line.variantId,
            movementType: "SALE_VOID",
            quantityChange: quantity,
            quantity,
            quantityBefore: before,
            quantityAfter: before + quantity,
            unitCost: Number(line.unitCost || 0),
            totalCost: quantity * Number(line.unitCost || 0),
            referenceType: "SALE_VOID",
            referenceId: sale.id,
            occurredAt: new Date(),
            deviceId: req.deviceId || "web",
            operationId: req.operationId || sale.id,
            idempotencyKey: key,
            notes: reason,
          },
        });
        await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, line.variantId);
        await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, line.variantId, null);
        await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, line.productId);
      }

      for (const payment of sale.payments.filter((p: any) => p.status === "COMPLETED")) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
        if (payment.paymentMethod === "CASH") {
          const cashKey = "SALE-VOID-CASH-" + payment.id;
          const existingCash = await tx.cashMovement.findFirst({
            where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: cashKey },
          });
          if (!existingCash) {
            const session = await tx.cashSession.findFirst({
              where: { tenantId: ctx.tenantId, branchId: ctx.branchId, cashierId: ctx.userId, status: { in: ["OPEN", "ACTIVE"] } },
              orderBy: { openedAt: "desc" },
            });
            if (!session) throw new Error("SALE_VOID_CASH_SESSION_REQUIRED");
            await tx.cashMovement.create({
              data: {
                id: randomUUID(),
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                cashSessionId: session.id,
                type: "CASH_OUT",
                amount: payment.amount,
                reason: "Void " + sale.saleNumber,
                deviceId: req.deviceId || "web",
                actorId: ctx.userId,
                approvalStatus: "APPROVED",
                idempotencyKey: cashKey,
                occurredAt: new Date(),
              },
            });
            await tx.cashSession.update({
              where: { id: session.id },
              data: { cashRefundsTotal: { increment: Number(payment.amount) } },
            });
          }
        }
      }

      if (sale.customerId && sale.payments.some((p: any) => p.paymentMethod === "CREDIT")) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { currentBalance: { decrement: Number(sale.grandTotal) } },
        });
      }

      const original = await tx.journalEntry.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, sourceType: "SALE", sourceId: sale.id },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      });
      if (original) {
        const reversalKey = "jrn-sale-void-" + sale.id;
        const existingReversal = await tx.journalEntry.findUnique({ where: { idempotencyKey: reversalKey } }).catch(() => null);
        if (!existingReversal) {
          await this.writeJournal(tx, ctx, {
            journal: {
              id: randomUUID(),
              journalNumber: "JRN-VOID-" + sale.id.slice(0, 8).toUpperCase(),
              entryDate: new Date().toISOString(),
              postingDate: new Date().toISOString(),
              sourceType: "REVERSAL",
              sourceId: sale.id,
              description: "Void Sale " + sale.saleNumber,
              currency: "TZS",
              exchangeRate: 1,
              totalDebit: Number(original.totalCredit),
              totalCredit: Number(original.totalDebit),
              isReversal: true,
              reversalOfJournalId: original.id,
              reversalReason: reason,
              idempotencyKey: reversalKey,
            },
            lines: (original.lines || []).map((line: any) => ({
              id: randomUUID(),
              accountId: line.accountId,
              costCenterId: line.costCenterId ?? null,
              description: "Void reversal " + sale.saleNumber,
              debit: Number(line.credit),
              credit: Number(line.debit),
              currency: line.currency || "TZS",
              exchangeRate: Number(line.exchangeRate || 1),
            })),
          });
        }
      }

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: { status: "CANCELLED" },
        include: { lines: true, payments: true },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: req.deviceId || "web",
          action: "SALE_VOIDED",
          entityType: "Sale",
          entityId: sale.id,
          metadata: {
            reason,
            operationId: req.operationId || sale.id,
            idempotencyKey: req.idempotencyKey || sale.id,
          },
        },
      });
      return { sale: updated, alreadyVoided: false };
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
          employeeId: req.employeeId || null,
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
          employeeId: existing.employeeId || null,
        });
        if (String(existing.idempotencyKey) === incomingKey && incomingFingerprint !== existingFingerprint) {
          throw new Error("EXPENSE_IDEMPOTENCY_CONFLICT");
        }
        return existing;
      }

      if (req.employeeId) {
        const employee = await tx.employee.findFirst({ where: { id: String(req.employeeId), tenantId: ctx.tenantId, OR: [{ branchId: ctx.branchId }, { branchId: null }] } });
        if (!employee) throw new Error("STAFF_EXPENSE_EMPLOYEE_NOT_FOUND");
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
          employeeId: req.employeeId ? String(req.employeeId) : null,
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
          metadata: { status, paymentMethod, amount: Number(req.amount), cashSessionId: cashSession?.id || null, employeeId: expense.employeeId || null, idempotencyKey: expense.idempotencyKey },
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
            journalNumber: `JRN-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`,
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
