import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PrismaAtomicCommercialFinanceService, PrismaCommercialRepository, prisma } from "@kwakopos2/database";
import { FinancialBridge } from "@kwakopos2/domain";

const enabled = Boolean(process.env.DATABASE_URL);

describe("Payments Production Lock", () => {
  it("persists provider reconciliation, reversal, refund, and return accounting end-to-end", async () => {
    if (!enabled) return;

    const tenantId = randomUUID();
    const branchId = randomUUID();
    const customerId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const saleId = randomUUID();
    const salePaymentId = randomUUID();
    const standalonePaymentId = randomUUID();
    const ctx: any = { tenantId, branchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] };
    const atomic = new PrismaAtomicCommercialFinanceService();
    const commercial = new PrismaCommercialRepository(atomic);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "Payments Production Lock",
        slug: `payments-lock-${tenantId.slice(0, 8)}`,
        branches: { create: { id: branchId, name: "Main", code: `PAY-${branchId.slice(0, 6)}` } },
      },
    });

    try {
      await prisma.customer.create({
        data: {
          id: customerId,
          tenantId,
          branchId,
          customerCode: "PAY-001",
          name: "Payments Lock Customer",
        },
      });

      await prisma.product.create({
        data: {
          id: productId,
          tenantId,
          branchId,
          name: "Payments Lock Product",
          sku: "PAY-LOCK-001",
        },
      });
      await prisma.productVariant.create({
        data: {
          id: variantId,
          tenantId,
          branchId,
          productId,
          name: "Default",
          sku: "PAY-LOCK-001-V1",
        },
      });

      const now = new Date();
      await prisma.sale.create({
        data: {
          id: saleId,
          tenantId,
          branchId,
          saleNumber: `SAL-PAY-LOCK-${saleId.slice(0, 8)}`,
          customerId,
          subtotal: 1000,
          grandTotal: 1000,
          totalCost: 400,
          grossProfit: 600,
          status: "COMPLETED",
          paymentStatus: "PAID",
          deviceId: "pay-lock",
          operationId: "sale-op-1",
          idempotencyKey: `sale-idempotency-${saleId}`,
          soldAt: now,
          lines: {
            create: {
              id: randomUUID(),
              productId,
              variantId,
              quantity: 1,
              unitPrice: 1000,
              unitCost: 400,
              lineTotal: 1000,
            },
          },
        },
      });

      await prisma.stockLedger.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId,
          productId,
          variantId,
          movementType: "PURCHASE",
          quantityChange: 10,
          quantity: 10,
          quantityBefore: 0,
          quantityAfter: 10,
          unitCost: 400,
          totalCost: 4000,
          referenceType: "PURCHASE_RECEIPT",
          referenceId: randomUUID(),
          occurredAt: now,
          deviceId: "pay-lock",
          operationId: "stock-op-1",
          idempotencyKey: "stock-idempotency-1",
        },
      });

      await prisma.payment.create({
        data: {
          id: salePaymentId,
          tenantId,
          branchId,
          paymentNumber: "PAY-SALE-001",
          saleId,
          customerId,
          amount: 1000,
          paymentMethod: "CASH",
          provider: "CASH",
          status: "COMPLETED",
          reconciliationStatus: "MATCHED",
          providerVerifiedAt: now,
          paidAt: now,
        },
      });

      const accounts = await atomic.getFinancialAccountLookup(ctx);
      const salePayment = await prisma.payment.findUniqueOrThrow({ where: { id: salePaymentId } });
      const paymentJournal = FinancialBridge.mapCustomerPaymentToJournal(ctx, salePayment as any, accounts as any, 1);
      await atomic.postFinancialJournal(ctx, paymentJournal);

      await prisma.payment.create({
        data: {
          id: standalonePaymentId,
          tenantId,
          branchId,
          paymentNumber: "PAY-STANDALONE-001",
          customerId,
          amount: 500,
          paymentMethod: "BANK",
          provider: "NMB",
          providerReference: "NMB-PAY-001",
          status: "COMPLETED",
          reconciliationStatus: "MATCHED",
          providerVerifiedAt: now,
          paidAt: now,
        },
      });
      const standalone = await prisma.payment.findUniqueOrThrow({ where: { id: standalonePaymentId } });
      const standaloneJournal = FinancialBridge.mapCustomerPaymentToJournal(ctx, standalone as any, accounts as any, 2);
      await atomic.postFinancialJournal(ctx, standaloneJournal);

      const reversed = await atomic.reversePayment(ctx, standalonePaymentId, "Payment production-lock reversal");
      expect(reversed.reversalOfPaymentId).toBe(standalonePaymentId);
      expect(reversed.status).toBe("REVERSED");
      const originalAfterReverse = await prisma.payment.findUniqueOrThrow({ where: { id: standalonePaymentId } });
      expect(originalAfterReverse.status).toBe("REVERSED");
      const reversalAudit = await prisma.auditEvent.findFirst({ where: { tenantId, branchId, action: "PAYMENT_REVERSED", entityId: standalonePaymentId } });
      expect(reversalAudit).toBeTruthy();

      const refundSourceId = randomUUID();
      await prisma.payment.create({
        data: {
          id: refundSourceId,
          tenantId,
          branchId,
          paymentNumber: "PAY-REFUND-SOURCE",
          customerId,
          amount: 300,
          paymentMethod: "BANK",
          provider: "NMB",
          providerReference: "NMB-REFUND-001",
          status: "COMPLETED",
          reconciliationStatus: "MATCHED",
          providerVerifiedAt: now,
          paidAt: now,
        },
      });
      const refundSource = await prisma.payment.findUniqueOrThrow({ where: { id: refundSourceId } });
      const refundSourceJournal = FinancialBridge.mapCustomerPaymentToJournal(ctx, refundSource as any, accounts as any, 3);
      await atomic.postFinancialJournal(ctx, refundSourceJournal);
      const refundHalf = await atomic.refundPayment(ctx, refundSourceId, {
        amount: 100,
        reason: "Partial refund 1",
        refundMethod: "BANK",
        provider: "NMB",
        providerReference: "NMB-REFUND-101",
        idempotencyKey: "refund-1",
      });
      expect(refundHalf.status).toBe("REFUNDED");
      const refundSourceAfter = await prisma.payment.findUniqueOrThrow({ where: { id: refundSourceId } });
      expect(Number(refundSourceAfter.refundedAmount)).toBe(100);
      expect(refundSourceAfter.status).toBe("PARTIALLY_REFUNDED");
      const refundHalfAudit = await prisma.auditEvent.findFirst({ where: { tenantId, branchId, action: "PAYMENT_REFUNDED", entityId: refundSourceId } });
      expect(refundHalfAudit).toBeTruthy();

      const returnResult = await commercial.createSaleReturn(ctx, {
        originalSaleId: saleId,
        customerId,
        reason: "Production lock return",
        refundType: "CASH",
        deviceId: "pay-lock",
        operationId: "return-op-1",
        idempotencyKey: "return-idempotency-1",
        items: [{ variantId, quantityReturned: 1, refundUnitPrice: 1000, condition: "GOOD" }],
      } as any);
      expect(returnResult.returnRecord.status).toBe("COMPLETED");
      expect(returnResult.refundPayment.isRefund).toBe(true);
      expect(returnResult.refundPayment.refundReturnId).toBe(returnResult.returnRecord.id);
      const returnJournal = await prisma.journalEntry.findFirst({ where: { tenantId, branchId, sourceType: "RETURN", sourceId: returnResult.returnRecord.id } });
      expect(returnJournal).toBeTruthy();
      const refundPaymentAudit = await prisma.auditEvent.findFirst({ where: { tenantId, branchId, action: "PAYMENT_REFUND_RECORDED", entityId: returnResult.refundPayment.id } });
      expect(refundPaymentAudit).toBeTruthy();
    } finally {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});