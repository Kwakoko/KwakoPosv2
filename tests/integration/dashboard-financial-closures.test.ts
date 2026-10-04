import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  prisma,
  PrismaAtomicCommercialFinanceService,
  PrismaCommercialRepository,
} from "@kwakopos2/database";
import { getDashboardKpiSnapshot } from "../../apps/api/src/services/dashboardKpiService.js";

describe("Dashboard financial closures", () => {
  it("reconciles VAT, split tender, partial returns and PostgreSQL-authoritative recent orders", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const customerId = randomUUID();
    const userId = randomUUID();
    const ctx: any = {
      tenantId,
      branchId,
      userId,
      roles: ["ADMIN"],
      permissions: ["*"],
    };
    const finance = new PrismaAtomicCommercialFinanceService();
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Dashboard Finance Closure", slug: "dash-fin-" + tenantId.slice(0, 12) } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "DFC-" + branchId.slice(0, 8) } });
      await prisma.customer.create({
        data: {
          id: customerId,
          tenantId,
          branchId,
          customerCode: "DFC-CUSTOMER",
          name: "Dashboard Closure Customer",
          status: "ACTIVE",
        },
      });
      await prisma.product.create({
        data: {
          id: productId,
          tenantId,
          branchId,
          name: "Dashboard Closure Product",
          sku: "DFC-001",
          category: "Certification",
          buyingPrice: 600,
          sellingPrice: 1180,
          hasVariants: true,
          totalStock: 10,
          availableStock: 10,
        },
      });
      await prisma.productVariant.create({
        data: {
          id: variantId,
          tenantId,
          branchId,
          productId,
          name: "Standard",
          sku: "DFC-001-STD",
          price: 1180,
          costPrice: 600,
          inventoryQuantity: 10,
          reorderLevel: 2,
          isActive: true,
        },
      });
      await prisma.stockLedger.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId,
          productId,
          variantId,
          movementType: "OPENING_STOCK",
          referenceType: "CERTIFICATION",
          quantityBefore: 0,
          quantityChange: 10,
          quantity: 10,
          quantityAfter: 10,
          unitCost: 600,
          totalCost: 6000,
          deviceId: "DASH-SETUP",
          operationId: "DASH-SETUP-" + productId,
          idempotencyKey: "DASH-SETUP-" + productId,
          occurredAt: new Date(),
        },
      });
      await prisma.productBranchStock.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId,
          productId,
          variantId,
          currentQuantity: 10,
          averageCost: 600,
          stockValue: 6000,
        },
      });
      await prisma.setting.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId,
          scope: "BRANCH",
          key: "tax.config",
          value: { vatEnabled: true, vatRatePercent: 18, taxInclusivePricing: true, currencyCode: "TZS" },
        },
      });

      const created = await finance.createSale(ctx, {
        customerId,
        items: [{ productId, variantId, quantity: 1, unitPrice: 1180, unitCost: 600 }],
        payments: [
          { amount: 590, paymentMethod: "CARD" },
          { amount: 590, paymentMethod: "MOBILE_MONEY" },
        ],
        deviceId: "DASH-DEVICE",
        operationId: "DASH-OP-" + randomUUID(),
        idempotencyKey: "DASH-IDEM-" + randomUUID(),
      });
      expect(Number(created.sale.grandTotal)).toBe(1180);
      expect(Number(created.sale.subtotal)).toBe(1000);
      expect(Number(created.sale.taxTotal)).toBe(180);
      expect(Number(created.sale.totalCost)).toBe(600);
      expect(Number(created.sale.grossProfit)).toBe(400);

      await prisma.return.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId,
          returnNumber: "RET-DFC-" + randomUUID().slice(0, 8),
          originalSaleId: created.sale.id,
          customerId,
          reason: "Partial return for dashboard closure",
          refundType: "CASH",
          totalRefundAmount: 590,
          status: "COMPLETED",
          lines: {
            create: [{
              id: randomUUID(),
              variantId,
              quantityReturned: 0.5,
              refundUnitPrice: 1180,
              refundLineTotal: 590,
              condition: "GOOD",
            }],
          },
        },
      });

      // Return COGS must use the cost captured on the original sale line, not a later master-price change.
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { costPrice: 900 },
      });

      const snapshot = await getDashboardKpiSnapshot(ctx, "7d");

      expect(snapshot.grossSalesToday).toBe(1000);
      expect(snapshot.discountsToday).toBe(0);
      expect(snapshot.refundsToday).toBe(590);
      expect(snapshot.salesToday).toBe(500);
      expect(snapshot.netSalesToday).toBe(500);
      expect(snapshot.cogsToday).toBe(300);
      expect(snapshot.grossProfit).toBe(200);
      expect(snapshot.analytics.totalRevenue).toBe(500);
      expect(snapshot.analytics.totalCOGS).toBe(300);
      expect(snapshot.analytics.totalProfit).toBe(200);
      expect(snapshot.analytics.marginPct).toBe("40.0");
      expect(snapshot.analytics.paymentTotalVolume).toBe(1180);
      expect(snapshot.analytics.paymentTotalCount).toBe(2);
      expect(snapshot.analytics.paymentTotalOrderCount).toBe(1);
      expect(snapshot.analytics.paymentOverallAov).toBe(1180);
      const card = snapshot.analytics.paymentChannels.find((x) => x.name === "CARD");
      const mobile = snapshot.analytics.paymentChannels.find((x) => x.name === "MOBILE_MONEY");
      expect(card?.paymentCount).toBe(1);
      expect(card?.orderCount).toBe(1);
      expect(mobile?.paymentCount).toBe(1);
      expect(mobile?.orderCount).toBe(1);
      expect(snapshot.analytics.topProducts[0]?.units).toBe(0.5);
      expect(snapshot.analytics.topProducts[0]?.revenue).toBe(500);

      const repository = new PrismaCommercialRepository();
      const recent = await repository.getSales(ctx);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.customer?.name).toBe("Dashboard Closure Customer");
      expect(recent[0]?.lines?.[0]?.product?.name).toBe("Dashboard Closure Product");
      expect(recent[0]?.payments).toHaveLength(2);
    } finally {
      await prisma.returnLine.deleteMany({ where: { returnRel: { tenantId } } });
      await prisma.return.deleteMany({ where: { tenantId } });
      await prisma.drawerOperation.deleteMany({ where: { tenantId } });
      await prisma.journalLine.deleteMany({ where: { journalEntry: { tenantId } } });
      await prisma.journalEntry.deleteMany({ where: { tenantId } });
      await prisma.payment.deleteMany({ where: { tenantId } });
      await prisma.saleLine.deleteMany({ where: { sale: { tenantId } } });
      await prisma.sale.deleteMany({ where: { tenantId } });
      await prisma.stockLedger.deleteMany({ where: { tenantId } });
      await prisma.productBranchStock.deleteMany({ where: { tenantId } });
      await prisma.productVariant.deleteMany({ where: { tenantId } });
      await prisma.product.deleteMany({ where: { tenantId } });
      await prisma.setting.deleteMany({ where: { tenantId } });
      await prisma.customer.deleteMany({ where: { tenantId } });
      await prisma.account.deleteMany({ where: { tenantId } });
      await prisma.auditEvent.deleteMany({ where: { tenantId } });
      await prisma.branch.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  });
});
