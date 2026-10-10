import { randomUUID } from "node:crypto";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";

export { applyRetailPricingPromotions } from "@kwakopos2/domain";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertFinitePositive(value: unknown, code: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function scope(ctx: TenantContext) {
  if (!ctx.tenantId || !ctx.branchId || !ctx.userId) throw new Error("TENANT_BRANCH_USER_CONTEXT_REQUIRED");
  return { tenantId: ctx.tenantId, branchId: ctx.branchId };
}

export class RetailParityService {
  async getLoyaltyProgram(ctx: TenantContext) {
    const s = scope(ctx);
    const saved = await prisma.loyaltyProgram.findFirst({ where: s });
    return saved ? {
      ...saved,
      currencyUnitsPerPoint: Number(saved.currencyUnitsPerPoint),
      currencyValuePerPoint: Number(saved.currencyValuePerPoint),
      maxRedemptionPct: Number(saved.maxRedemptionPct),
    } : {
      tenantId: ctx.tenantId, branchId: ctx.branchId, currencyUnitsPerPoint: 1000,
      currencyValuePerPoint: 1, maxRedemptionPct: 20, isActive: false, isDefault: true,
    };
  }

  async saveLoyaltyProgram(ctx: TenantContext, input: {
    currencyUnitsPerPoint: number; currencyValuePerPoint: number; maxRedemptionPct: number; isActive?: boolean;
  }) {
    const s = scope(ctx);
    const currencyUnitsPerPoint = assertFinitePositive(input.currencyUnitsPerPoint, "LOYALTY_EARN_THRESHOLD_INVALID");
    const currencyValuePerPoint = assertFinitePositive(input.currencyValuePerPoint, "LOYALTY_REDEMPTION_RATE_INVALID");
    const maxRedemptionPct = Number(input.maxRedemptionPct);
    if (!Number.isFinite(maxRedemptionPct) || maxRedemptionPct < 0 || maxRedemptionPct > 100) {
      throw new Error("LOYALTY_REDEMPTION_PERCENT_INVALID");
    }
    return prisma.$transaction(async (tx: any) => {
      const current = await tx.loyaltyProgram.findFirst({ where: s });
      const data = { currencyUnitsPerPoint, currencyValuePerPoint, maxRedemptionPct, isActive: input.isActive !== false };
      const row = current
        ? await tx.loyaltyProgram.update({ where: { id: current.id }, data })
        : await tx.loyaltyProgram.create({ data: { id: randomUUID(), ...s, ...data, createdById: ctx.userId } });
      await tx.auditEvent.create({
        data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId, action: "RETAIL_LOYALTY_PROGRAM_UPDATED",
          entityType: "LoyaltyProgram", entityId: row.id,
          metadata: { currencyUnitsPerPoint, currencyValuePerPoint, maxRedemptionPct, isActive: row.isActive } },
      });
      return row;
    });
  }

  async getLoyaltyBalance(ctx: TenantContext, customerId: string) {
    const s = scope(ctx);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, ...s, status: "ACTIVE" }, select: { id: true } });
    if (!customer) throw new Error("LOYALTY_CUSTOMER_NOT_FOUND_IN_ACTIVE_SCOPE");
    const agg = await prisma.loyaltyLedgerEntry.aggregate({
      where: { ...s, customerId }, _sum: { pointsDelta: true },
    });
    return { customerId, pointsBalance: Number(agg._sum.pointsDelta || 0) };
  }

  async listLoyaltyLedger(ctx: TenantContext, customerId: string, limit = 100) {
    const s = scope(ctx);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, ...s }, select: { id: true } });
    if (!customer) throw new Error("LOYALTY_CUSTOMER_NOT_FOUND_IN_ACTIVE_SCOPE");
    const rows = await prisma.loyaltyLedgerEntry.findMany({
      where: { ...s, customerId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((row: any) => ({ ...row, monetaryValue: Number(row.monetaryValue) }));
  }

  private async changePoints(ctx: TenantContext, input: {
    customerId: string; entryType: string; pointsDelta: number; monetaryValue?: number;
    idempotencyKey: string; reason: string; referenceType?: string; referenceId?: string; allowNegativeBalance?: boolean;
  }) {
    const s = scope(ctx);
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new Error("LOYALTY_IDEMPOTENCY_KEY_INVALID");
    if (!Number.isInteger(input.pointsDelta) || input.pointsDelta === 0) throw new Error("LOYALTY_POINTS_DELTA_INVALID");
    return prisma.$transaction(async (tx: any) => {
      // Serialize redemptions on the customer row so concurrent requests cannot overspend points.
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "customers" WHERE "id" = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE',
        input.customerId, ctx.tenantId, ctx.branchId,
      );
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, ...s, status: "ACTIVE" } });
      if (!customer) throw new Error("LOYALTY_CUSTOMER_NOT_FOUND_IN_ACTIVE_SCOPE");

      const existing = await tx.loyaltyLedgerEntry.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.customerId !== input.customerId || existing.entryType !== input.entryType ||
            Number(existing.pointsDelta) !== input.pointsDelta) throw new Error("LOYALTY_IDEMPOTENCY_KEY_REUSED");
        const balance = await tx.loyaltyLedgerEntry.aggregate({
          where: { ...s, customerId: input.customerId }, _sum: { pointsDelta: true },
        });
        return { entry: existing, pointsBalance: Number(balance._sum.pointsDelta || 0), duplicate: true };
      }

      const balance = await tx.loyaltyLedgerEntry.aggregate({
        where: { ...s, customerId: input.customerId }, _sum: { pointsDelta: true },
      });
      const currentPoints = Number(balance._sum.pointsDelta || 0);
      if (currentPoints + input.pointsDelta < 0 && input.allowNegativeBalance !== true) throw new Error("LOYALTY_INSUFFICIENT_POINTS");
      const entry = await tx.loyaltyLedgerEntry.create({
        data: {
          id: randomUUID(), ...s, customerId: input.customerId, entryType: input.entryType,
          pointsDelta: input.pointsDelta, monetaryValue: roundMoney(Number(input.monetaryValue || 0)),
          referenceType: input.referenceType || null, referenceId: input.referenceId || null,
          idempotencyKey: input.idempotencyKey, reason: input.reason.trim().slice(0, 500), createdById: ctx.userId,
        },
      });
      await tx.auditEvent.create({
        data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId,
          action: "RETAIL_LOYALTY_LEDGER_" + input.entryType, entityType: "LoyaltyLedgerEntry", entityId: entry.id,
          metadata: { customerId: input.customerId, pointsDelta: input.pointsDelta, monetaryValue: Number(entry.monetaryValue),
            referenceType: input.referenceType || null, referenceId: input.referenceId || null, reason: input.reason } },
      });
      return { entry, pointsBalance: currentPoints + input.pointsDelta, duplicate: false };
    }, { isolationLevel: "Serializable" });
  }

  async adjustLoyaltyPoints(ctx: TenantContext, input: {
    customerId: string; pointsDelta: number; idempotencyKey: string; reason: string;
  }) {
    if (!input.reason?.trim()) throw new Error("LOYALTY_REASON_REQUIRED");
    return this.changePoints(ctx, {
      ...input, entryType: "ADJUSTMENT", reason: input.reason.trim(), referenceType: "MANUAL_ADJUSTMENT",
      referenceId: input.idempotencyKey,
    });
  }

  async quoteLoyaltyRedemption(ctx: TenantContext, input: {
    customerId: string; points: number; basketAmount: number;
  }) {
    const s = scope(ctx);
    const points = assertFinitePositive(input.points, "LOYALTY_REDEEM_POINTS_INVALID");
    if (!Number.isSafeInteger(points)) throw new Error("LOYALTY_REDEEM_POINTS_MUST_BE_INTEGER");
    const basketAmount = Number(input.basketAmount);
    if (!Number.isFinite(basketAmount) || basketAmount <= 0) throw new Error("LOYALTY_BASKET_AMOUNT_INVALID");
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, ...s, status: "ACTIVE" }, select: { id: true },
    });
    if (!customer) throw new Error("LOYALTY_CUSTOMER_NOT_FOUND_IN_ACTIVE_SCOPE");
    const program = await prisma.loyaltyProgram.findFirst({ where: { ...s, isActive: true } });
    if (!program) throw new Error("LOYALTY_PROGRAM_INACTIVE");
    const balance = await prisma.loyaltyLedgerEntry.aggregate({
      where: { ...s, customerId: input.customerId }, _sum: { pointsDelta: true },
    });
    const pointsBalance = Number(balance._sum.pointsDelta || 0);
    if (points > pointsBalance) throw new Error("LOYALTY_INSUFFICIENT_POINTS");
    const monetaryValue = roundMoney(points * Number(program.currencyValuePerPoint));
    if (!Number.isFinite(monetaryValue) || monetaryValue <= 0) throw new Error("LOYALTY_REDEMPTION_VALUE_INVALID");
    const maxRedemptionValue = roundMoney(basketAmount * Number(program.maxRedemptionPct) / 100);
    if (monetaryValue > maxRedemptionValue + 0.005) throw new Error("LOYALTY_REDEMPTION_EXCEEDS_BASKET_LIMIT");
    if (monetaryValue >= basketAmount - 0.005) throw new Error("LOYALTY_REDEMPTION_CANNOT_ZERO_SALE");
    return {
      customerId: input.customerId, points, pointsBalance, pointsRemaining: pointsBalance - points,
      basketAmount: roundMoney(basketAmount), monetaryValue, maxRedemptionPct: Number(program.maxRedemptionPct),
      programId: program.id, requiresCheckout: true,
    };
  }

  async earnPointsForSale(ctx: TenantContext, saleId: string) {
    const s = scope(ctx);
    const sale = await prisma.sale.findFirst({ where: { id: saleId, ...s } });
    if (!sale || !sale.customerId || sale.status !== "COMPLETED" || sale.paymentStatus !== "PAID") return null;
    const program = await this.getLoyaltyProgram(ctx);
    if (!program.isActive) return null;
    const earned = Math.floor(Number(sale.grandTotal) / Number(program.currencyUnitsPerPoint));
    if (earned <= 0) return null;
    return this.changePoints(ctx, {
      customerId: sale.customerId, entryType: "EARN", pointsDelta: earned, monetaryValue: Number(sale.grandTotal),
      idempotencyKey: "sale:" + sale.id + ":loyalty-earn", reason: "Points earned on paid sale",
      referenceType: "SALE", referenceId: sale.id,
    });
  }

  async reversePointsForReturn(ctx: TenantContext, returnId: string) {
    const s = scope(ctx);
    const ret = await prisma.return.findFirst({ where: { id: returnId, ...s, status: "COMPLETED" } });
    if (!ret?.originalSaleId || !ret.customerId) return null;
    const sale = await prisma.sale.findFirst({ where: { id: ret.originalSaleId, ...s } });
    if (!sale || Number(sale.grandTotal) <= 0) return null;
    const earned = await prisma.loyaltyLedgerEntry.findFirst({
      where: { ...s, customerId: ret.customerId, entryType: "EARN", referenceType: "SALE", referenceId: sale.id },
    });
    if (!earned || Number(earned.pointsDelta) <= 0) return null;
    const returns = await prisma.return.findMany({ where: { ...s, originalSaleId: sale.id, status: "COMPLETED" } });
    const refundedTotal = returns.reduce((sum: number, item: any) => sum + Number(item.totalRefundAmount), 0);
    const targetReversal = Math.min(Number(earned.pointsDelta), Math.floor(Number(earned.pointsDelta) * Math.min(1, refundedTotal / Number(sale.grandTotal))));
    const prior = await prisma.loyaltyLedgerEntry.aggregate({
      where: { ...s, customerId: ret.customerId, entryType: "RETURN_REVERSAL", referenceType: "SALE", referenceId: sale.id },
      _sum: { pointsDelta: true },
    });
    const alreadyReversed = Math.abs(Math.min(0, Number(prior._sum.pointsDelta || 0)));
    const remaining = targetReversal - alreadyReversed;
    if (remaining <= 0) return null;
    return this.changePoints(ctx, {
      customerId: ret.customerId, entryType: "RETURN_REVERSAL", pointsDelta: -remaining, monetaryValue: Number(ret.totalRefundAmount),
      idempotencyKey: "return:" + ret.id + ":loyalty-reversal", reason: "Reverse sale-earned points proportionally to completed returns",
      referenceType: "SALE", referenceId: sale.id, allowNegativeBalance: true,
    });
  }

  async createExchange(ctx: TenantContext, input: { returnId: string; replacementSaleId: string; idempotencyKey: string }) {
    const s = scope(ctx);
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 200) throw new Error("EXCHANGE_IDEMPOTENCY_KEY_INVALID");
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.saleExchange.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey }, include: { lines: true },
      });
      if (existing) {
        if (existing.branchId !== ctx.branchId) throw new Error("EXCHANGE_BRANCH_BOUNDARY_VIOLATION");
        if (existing.returnId !== input.returnId || existing.replacementSaleId !== input.replacementSaleId) {
          throw new Error("EXCHANGE_IDEMPOTENCY_KEY_REUSED");
        }
        return existing;
      }
      const ret = await tx.return.findFirst({ where: { id: input.returnId, ...s, status: "COMPLETED" }, include: { lines: true } });
      if (!ret || !ret.originalSaleId) throw new Error("EXCHANGE_RETURN_NOT_FOUND_IN_ACTIVE_SCOPE");
      const originalSale = await tx.sale.findFirst({ where: { id: ret.originalSaleId, ...s } });
      const replacement = await tx.sale.findFirst({ where: { id: input.replacementSaleId, ...s }, include: { lines: true } });
      if (!originalSale || !replacement || replacement.status !== "COMPLETED") throw new Error("EXCHANGE_SALES_NOT_FOUND_IN_ACTIVE_SCOPE");
      if (replacement.id === originalSale.id) throw new Error("EXCHANGE_REPLACEMENT_MUST_BE_A_NEW_SALE");
      if (ret.customerId && replacement.customerId && ret.customerId !== replacement.customerId) throw new Error("EXCHANGE_CUSTOMER_BOUNDARY_VIOLATION");
      if (await tx.saleExchange.findFirst({ where: { returnId: ret.id } })) throw new Error("EXCHANGE_RETURN_ALREADY_LINKED");
      if (await tx.saleExchange.findFirst({ where: { replacementSaleId: replacement.id } })) throw new Error("EXCHANGE_REPLACEMENT_SALE_ALREADY_LINKED");
      const returnAmount = roundMoney(Number(ret.totalRefundAmount));
      const replacementAmount = roundMoney(Number(replacement.grandTotal));
      const netAmount = roundMoney(replacementAmount - returnAmount);
      const now = new Date();
      const exchangeNumber = "EX-" + now.toISOString().replace(/\D/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8).toUpperCase();
      const lines = [
        ...ret.lines.map((line: any) => ({
          id: randomUUID(), side: "RETURN", variantId: line.variantId, quantity: line.quantityReturned,
          unitPrice: line.refundUnitPrice, lineTotal: line.refundLineTotal,
        })),
        ...replacement.lines.map((line: any) => ({
          id: randomUUID(), side: "REPLACEMENT", variantId: line.variantId, quantity: line.quantity,
          unitPrice: line.unitPrice, lineTotal: line.lineTotal,
        })),
      ];
      const row = await tx.saleExchange.create({
        data: {
          id: randomUUID(), ...s, exchangeNumber, idempotencyKey: input.idempotencyKey,
          originalSaleId: originalSale.id, returnId: ret.id, replacementSaleId: replacement.id,
          customerId: ret.customerId || replacement.customerId || null, returnAmount, replacementAmount, netAmount,
          status: "RECORDED",
          settlementStatus: netAmount > 0.005 ? "CUSTOMER_PAYMENT_DUE"
            : netAmount < -0.005 ? "CUSTOMER_REFUND_DUE" : "BALANCED_REQUIRES_CONFIRMATION",
          createdById: ctx.userId, lines: { create: lines },
        },
        include: { lines: true },
      });
      await tx.auditEvent.create({
        data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId, action: "RETAIL_EXCHANGE_RECORDED",
          entityType: "SaleExchange", entityId: row.id,
          metadata: { returnId: ret.id, originalSaleId: originalSale.id, replacementSaleId: replacement.id,
            returnAmount, replacementAmount, netAmount, settlementStatus: row.settlementStatus } },
      });
      return row;
    }, { isolationLevel: "Serializable" });
  }

  async listExchanges(ctx: TenantContext) {
    const s = scope(ctx);
    return prisma.saleExchange.findMany({ where: s, include: { lines: true }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  async createOmnichannelOrder(ctx: TenantContext, input: {
    orderNumber?: string; channel: string; externalOrderId?: string; idempotencyKey: string; customerId?: string;
    fulfillmentType: string; trackingReference?: string;
    items: Array<{ variantId: string; quantity: number; unitPrice: number; externalLineId?: string }>;
  }) {
    const s = scope(ctx);
    const allowedChannels = ["WEBSTORE", "MARKETPLACE", "PHONE", "SOCIAL"];
    if (!allowedChannels.includes(input.channel)) throw new Error("OMNICHANNEL_CHANNEL_INVALID");
    if (!["PICKUP", "DELIVERY", "SHIP"].includes(input.fulfillmentType)) throw new Error("OMNICHANNEL_FULFILLMENT_TYPE_INVALID");
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 200) throw new Error("OMNICHANNEL_IDEMPOTENCY_KEY_INVALID");
    if (!input.items.length) throw new Error("OMNICHANNEL_ORDER_ITEMS_REQUIRED");
    const qtyByVariant = new Map<string, number>();
    for (const item of input.items) {
      const quantity = assertFinitePositive(item.quantity, "OMNICHANNEL_QUANTITY_INVALID");
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("OMNICHANNEL_UNIT_PRICE_INVALID");
      qtyByVariant.set(item.variantId, (qtyByVariant.get(item.variantId) || 0) + quantity);
    }
    return prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "branches" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
        ctx.branchId, ctx.tenantId,
      );
      const prior = await tx.salesOrder.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey }, include: { items: true },
      });
      if (prior) {
        if (prior.branchId !== ctx.branchId || prior.channel !== input.channel ||
            (input.externalOrderId && prior.externalOrderId !== input.externalOrderId)) {
          throw new Error("OMNICHANNEL_IDEMPOTENCY_KEY_REUSED");
        }
        return prior;
      }
      if (input.externalOrderId) {
        const external = await tx.salesOrder.findFirst({
          where: { tenantId: ctx.tenantId, channel: input.channel, externalOrderId: input.externalOrderId },
        });
        if (external) throw new Error("OMNICHANNEL_EXTERNAL_ORDER_ALREADY_INGESTED");
      }
      if (input.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: input.customerId, ...s, status: "ACTIVE" } });
        if (!customer) throw new Error("OMNICHANNEL_CUSTOMER_NOT_FOUND_IN_ACTIVE_SCOPE");
      }
      const variants: Record<string, any> = {};
      for (const [variantId, quantity] of qtyByVariant.entries()) {
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "product_variants" WHERE "id" = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE',
          variantId, ctx.tenantId, ctx.branchId,
        );
        const variant = await tx.productVariant.findFirst({ where: { id: variantId, ...s, isActive: true } });
        if (!variant) throw new Error("OMNICHANNEL_VARIANT_NOT_FOUND_IN_ACTIVE_SCOPE");
        const balance = await tx.productVariantBalance.findFirst({ where: { variantId, ...s } });
        const available = Number(balance ? balance.currentQuantity : variant.inventoryQuantity) - Number(variant.reservedQuantity || 0);
        if (!Number.isFinite(available) || available < quantity) throw new Error("OMNICHANNEL_INSUFFICIENT_AVAILABLE_STOCK:" + variantId);
        await tx.productVariant.update({ where: { id: variant.id }, data: { reservedQuantity: { increment: quantity } } });
        variants[variantId] = variant;
      }
      const items = input.items.map((item) => ({
        id: randomUUID(), variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice,
        totalPrice: roundMoney(item.quantity * item.unitPrice), externalLineId: item.externalLineId || null,
      }));
      const totalAmount = roundMoney(items.reduce((sum, item) => sum + Number(item.totalPrice), 0));
      const now = new Date();
      const row = await tx.salesOrder.create({
        data: {
          id: randomUUID(), ...s, orderNumber: input.orderNumber?.trim() ||
            "CH-" + now.toISOString().replace(/\D/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8).toUpperCase(),
          customerId: input.customerId || null, status: "CONFIRMED", totalAmount, channel: input.channel,
          externalOrderId: input.externalOrderId || null, idempotencyKey: input.idempotencyKey,
          fulfillmentType: input.fulfillmentType, fulfillmentStatus: "RESERVED", paymentStatus: "UNPAID",
          trackingReference: input.trackingReference || null, inventoryReservedAt: now, createdById: ctx.userId,
          items: { create: items },
        },
        include: { items: true },
      });
      await tx.auditEvent.create({
        data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId, action: "OMNICHANNEL_ORDER_CREATED",
          entityType: "SalesOrder", entityId: row.id,
          metadata: { channel: row.channel, externalOrderId: row.externalOrderId, itemCount: items.length,
            totalAmount, fulfillmentType: row.fulfillmentType, paymentStatus: row.paymentStatus } },
      });
      return row;
    }, { isolationLevel: "Serializable" });
  }

  async recordOmnichannelPayment(ctx: TenantContext, orderId: string, input: {
    amount: number; paymentMethod: string; provider?: string; providerReference?: string;
    idempotencyKey: string; reconciliationReference: string;
  }) {
    const s = scope(ctx);
    const amount = assertFinitePositive(input.amount, "OMNICHANNEL_PAYMENT_AMOUNT_INVALID");
    if (!["CASH", "CARD", "BANK", "MOBILE_MONEY", "OTHER"].includes(input.paymentMethod)) {
      throw new Error("OMNICHANNEL_PAYMENT_METHOD_INVALID");
    }
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 160) throw new Error("OMNICHANNEL_PAYMENT_IDEMPOTENCY_KEY_INVALID");
    if (!input.reconciliationReference?.trim() || input.reconciliationReference.length > 200) {
      throw new Error("OMNICHANNEL_PAYMENT_RECONCILIATION_REFERENCE_REQUIRED");
    }
    const scopedIdempotencyKey = "omnichannel:" + ctx.tenantId + ":" + input.idempotencyKey;
    return prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "sales_orders" WHERE "id" = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE',
        orderId, ctx.tenantId, ctx.branchId,
      );
      const order = await tx.salesOrder.findFirst({ where: { id: orderId, ...s }, include: { items: true } });
      if (!order || order.channel === "POS") throw new Error("OMNICHANNEL_ORDER_NOT_FOUND_IN_ACTIVE_SCOPE");
      if (order.status === "CANCELLED") throw new Error("OMNICHANNEL_CANCELLED_ORDER_CANNOT_BE_PAID");
      const duplicate = await tx.payment.findFirst({ where: { idempotencyKey: scopedIdempotencyKey } });
      if (duplicate) {
        if (duplicate.salesOrderId !== order.id || Number(duplicate.amount) !== amount ||
            duplicate.paymentMethod !== input.paymentMethod || duplicate.reconciliationReference !== input.reconciliationReference) {
          throw new Error("OMNICHANNEL_PAYMENT_IDEMPOTENCY_KEY_REUSED");
        }
        const total = await tx.payment.aggregate({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, salesOrderId: order.id,
            status: "COMPLETED", reconciliationStatus: "RECONCILED" }, _sum: { amount: true },
        });
        const paid = Number(total._sum.amount || 0);
        const paymentStatus = paid + 0.005 >= Number(order.totalAmount) ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
        return { payment: duplicate, order, paidAmount: roundMoney(paid), paymentStatus, duplicate: true };
      }

      const totalBefore = await tx.payment.aggregate({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, salesOrderId: order.id,
          status: "COMPLETED", reconciliationStatus: "RECONCILED" }, _sum: { amount: true },
      });
      const paidBefore = Number(totalBefore._sum.amount || 0);
      if (paidBefore + amount > Number(order.totalAmount) + 0.005) throw new Error("OMNICHANNEL_PAYMENT_EXCEEDS_OUTSTANDING_BALANCE");

      const now = new Date();
      const payment = await tx.payment.create({
        data: {
          id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId,
          paymentNumber: "OP-" + now.toISOString().replace(/\D/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8).toUpperCase(),
          salesOrderId: order.id, saleId: null, purchaseReceiptId: null,
          customerId: order.customerId || null, supplierId: null, amount,
          paymentMethod: input.paymentMethod, provider: input.provider || null, providerReference: input.providerReference || null,
          idempotencyKey: scopedIdempotencyKey, providerVerifiedAt: null,
          reconciliationStatus: "RECONCILED", reconciliationReference: input.reconciliationReference.trim(),
          reconciledAt: now, status: "COMPLETED", paidAt: now,
        },
      });
      const paidAmount = roundMoney(paidBefore + amount);
      const paymentStatus = paidAmount + 0.005 >= Number(order.totalAmount) ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";
      const updatedOrder = await tx.salesOrder.update({
        where: { id: order.id }, data: { paymentStatus }, include: { items: true },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId,
          action: "OMNICHANNEL_PAYMENT_RECONCILED", entityType: "Payment", entityId: payment.id,
          metadata: { orderId: order.id, channel: order.channel, amount, paymentMethod: input.paymentMethod,
            paymentStatus, paidAmount, reconciliationReference: input.reconciliationReference.trim() },
        },
      });
      return { payment, order: updatedOrder, paidAmount, paymentStatus, duplicate: false };
    }, { isolationLevel: "Serializable" });
  }

  async listOmnichannelOrders(ctx: TenantContext) {
    const s = scope(ctx);
    return prisma.salesOrder.findMany({
      where: { ...s, channel: { not: "POS" } }, include: { items: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async transitionOmnichannelOrder(ctx: TenantContext, orderId: string, input: {
    action: "CANCEL" | "SHIP" | "DELIVER" | "PICKUP"; trackingReference?: string;
  }) {
    const s = scope(ctx);
    return prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "sales_orders" WHERE "id" = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE',
        orderId, ctx.tenantId, ctx.branchId,
      );
      const order = await tx.salesOrder.findFirst({ where: { id: orderId, ...s }, include: { items: true } });
      if (!order || order.channel === "POS") throw new Error("OMNICHANNEL_ORDER_NOT_FOUND_IN_ACTIVE_SCOPE");
      if (input.action === "CANCEL") {
        if (order.status === "FULFILLED" || ["SHIPPED", "DELIVERED", "PICKED_UP"].includes(order.fulfillmentStatus)) {
          throw new Error("OMNICHANNEL_FULFILLED_ORDER_CANNOT_BE_CANCELLED");
        }
        if (order.status === "CANCELLED") return order;
        for (const item of order.items) {
          const released = await tx.productVariant.updateMany({
            where: { id: item.variantId, ...s, reservedQuantity: { gte: item.quantity } },
            data: { reservedQuantity: { decrement: item.quantity } },
          });
          if (released.count !== 1) throw new Error("OMNICHANNEL_CANCEL_RESERVATION_DRIFT");
        }
        const cancelled = await tx.salesOrder.update({
          where: { id: order.id }, data: { status: "CANCELLED", fulfillmentStatus: "CANCELLED" }, include: { items: true },
        });
        await tx.auditEvent.create({
          data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId, action: "OMNICHANNEL_ORDER_CANCELLED",
            entityType: "SalesOrder", entityId: order.id, metadata: { channel: order.channel } },
        });
        return cancelled;
      }

      if (input.action === "DELIVER") {
        if (order.fulfillmentStatus !== "SHIPPED") throw new Error("OMNICHANNEL_DELIVERY_REQUIRES_SHIPPED_ORDER");
        const delivered = await tx.salesOrder.update({
          where: { id: order.id }, data: { fulfillmentStatus: "DELIVERED", deliveredAt: new Date() }, include: { items: true },
        });
        await tx.auditEvent.create({
          data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId, action: "OMNICHANNEL_ORDER_DELIVERED",
            entityType: "SalesOrder", entityId: order.id, metadata: { trackingReference: order.trackingReference } },
        });
        return delivered;
      }

      if (order.status === "FULFILLED" || order.status === "CANCELLED") throw new Error("OMNICHANNEL_ORDER_TERMINAL_STATE");
      if (order.paymentStatus !== "PAID") throw new Error("OMNICHANNEL_PAYMENT_REQUIRED_BEFORE_FULFILLMENT");
      if (input.action === "SHIP" && !["DELIVERY", "SHIP"].includes(order.fulfillmentType)) throw new Error("OMNICHANNEL_SHIP_NOT_ALLOWED_FOR_FULFILLMENT_TYPE");
      if (input.action === "PICKUP" && order.fulfillmentType !== "PICKUP") throw new Error("OMNICHANNEL_PICKUP_NOT_ALLOWED_FOR_FULFILLMENT_TYPE");

      for (const item of order.items) {
        const variant = await tx.productVariant.findFirst({ where: { id: item.variantId, ...s } });
        if (!variant) throw new Error("OMNICHANNEL_VARIANT_NOT_FOUND_IN_ACTIVE_SCOPE");
        const balance = await tx.productVariantBalance.findFirst({ where: { variantId: item.variantId, ...s } });
        const before = Number(balance ? balance.currentQuantity : variant.inventoryQuantity);
        const quantity = Number(item.quantity);
        if (Number(variant.reservedQuantity || 0) < quantity || before < quantity) throw new Error("OMNICHANNEL_RESERVATION_STOCK_DRIFT");
        const key = "CHANNEL-ORDER-" + input.action + "-" + order.id + "-" + item.id;
        const ledger = await tx.stockLedger.findFirst({ where: { ...s, idempotencyKey: key } });
        if (!ledger) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { reservedQuantity: { decrement: quantity }, inventoryQuantity: { decrement: quantity } },
          });
          if (balance) {
            await tx.productVariantBalance.update({
              where: { id: balance.id },
              data: { currentQuantity: { decrement: quantity }, stockValue: { decrement: roundMoney(quantity * Number(balance.averageCost)) } },
            });
          }
          await tx.stockLedger.create({
            data: {
              id: randomUUID(), ...s, productId: variant.productId, variantId: variant.id, movementType: "SALE",
              quantityChange: -quantity, quantity, quantityBefore: before, quantityAfter: before - quantity,
              unitCost: Number(variant.costPrice || 0), totalCost: roundMoney(quantity * Number(variant.costPrice || 0)),
              referenceType: "CHANNEL_ORDER", referenceId: order.id, occurredAt: new Date(), deviceId: ctx.userId,
              operationId: order.id, idempotencyKey: key, notes: "Omnichannel fulfillment " + input.action,
            },
          });
        }
        await tx.salesOrderItem.update({ where: { id: item.id }, data: { fulfilledQuantity: quantity } });
      }
      const fulfillmentStatus = input.action === "SHIP" ? "SHIPPED" : "PICKED_UP";
      const updated = await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          status: "FULFILLED", fulfillmentStatus, shippedAt: input.action === "SHIP" ? new Date() : null,
          deliveredAt: null, trackingReference: input.trackingReference || order.trackingReference,
        },
        include: { items: true },
      });
      await tx.auditEvent.create({
        data: { id: randomUUID(), ...s, userId: ctx.userId, deviceId: ctx.userId,
          action: input.action === "SHIP" ? "OMNICHANNEL_ORDER_SHIPPED" : "OMNICHANNEL_ORDER_PICKED_UP",
          entityType: "SalesOrder", entityId: order.id,
          metadata: { channel: order.channel, trackingReference: updated.trackingReference, totalAmount: Number(order.totalAmount) } },
      });
      return updated;
    }, { isolationLevel: "Serializable" });
  }
}

export const globalRetailParityService = new RetailParityService();
