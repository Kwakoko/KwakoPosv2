import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaCommercialRepository } from "@kwakopos2/database";
import { getDashboardKpiSnapshot } from "../../apps/api/src/services/dashboardKpiService.js";

describe("Dashboard final production closures", () => {
  it("enforces tenant isolation, metric-consistent top-product ranking, and authoritative cashier identity", async () => {
    const tenantA = randomUUID();
    const branchA = randomUUID();
    const tenantB = randomUUID();
    const branchB = randomUUID();
    const roleA = randomUUID();
    const userA = randomUUID();
    const productA = randomUUID();
    const variantA = randomUUID();
    const productB = randomUUID();
    const variantB = randomUUID();
    const saleA = randomUUID();
    const saleB = randomUUID();

    const ctx: any = {
      tenantId: tenantA,
      branchId: branchA,
      userId: userA,
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    try {
      await prisma.tenant.createMany({
        data: [
          { id: tenantA, name: "Dashboard Final A", slug: "dash-final-a-" + tenantA.slice(0, 8) },
          { id: tenantB, name: "Dashboard Final B", slug: "dash-final-b-" + tenantB.slice(0, 8) },
        ],
      });
      await prisma.branch.createMany({
        data: [
          { id: branchA, tenantId: tenantA, name: "Main A", code: "DFA-" + branchA.slice(0, 8) },
          { id: branchB, tenantId: tenantB, name: "Main B", code: "DFB-" + branchB.slice(0, 8) },
        ],
      });
      await prisma.role.create({
        data: {
          id: roleA,
          tenantId: tenantA,
          name: "Dashboard Cashier",
          permissions: ["*"],
        },
      });
      await prisma.user.create({
        data: {
          id: userA,
          tenantId: tenantA,
          branchId: branchA,
          email: "dashboard-final-" + userA.slice(0, 8) + "@example.test",
          passwordHash: "test-only",
          name: "Amani Dashboard Cashier",
          roleId: roleA,
          status: "ACTIVE",
        },
      });

      await prisma.product.createMany({
        data: [
          {
            id: productA, tenantId: tenantA, branchId: branchA, name: "Revenue Leader",
            sku: "DF-A", category: "Test", buyingPrice: 600, sellingPrice: 500,
            hasVariants: true, totalStock: 10, availableStock: 10,
          },
          {
            id: productB, tenantId: tenantA, branchId: branchA, name: "Units Leader",
            sku: "DF-B", category: "Test", buyingPrice: 50, sellingPrice: 100,
            hasVariants: true, totalStock: 20, availableStock: 20,
          },
        ],
      });
      await prisma.productVariant.createMany({
        data: [
          {
            id: variantA, tenantId: tenantA, branchId: branchA, productId: productA,
            name: "Standard", sku: "DF-A-STD", price: 500, costPrice: 600,
            inventoryQuantity: 10, reorderLevel: 2, isActive: true,
          },
          {
            id: variantB, tenantId: tenantA, branchId: branchA, productId: productB,
            name: "Standard", sku: "DF-B-STD", price: 100, costPrice: 50,
            inventoryQuantity: 20, reorderLevel: 2, isActive: true,
          },
        ],
      });

      const now = new Date();
      await prisma.sale.create({
        data: {
          id: saleA,
          tenantId: tenantA,
          branchId: branchA,
          saleNumber: "SAL-DF-A",
          subtotal: 500,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 500,
          totalCost: 300,
          grossProfit: 200,
          status: "COMPLETED",
          paymentStatus: "PAID",
          deviceId: "DF-DEVICE-A",
          operationId: "DF-OP-A",
          idempotencyKey: "DF-IDEM-A-" + saleA,
          soldById: userA,
          soldAt: now,
          lines: {
            create: [{
              id: randomUUID(), productId: productA, variantId: variantA, quantity: 0.5,
              unitPrice: 1000, unitCost: 600, discountAmount: 0, taxAmount: 0, lineTotal: 500,
            }],
          },
          payments: {
            create: [{
              id: randomUUID(), tenantId: tenantA, branchId: branchA, paymentNumber: "PAY-DF-A",
              amount: 500, paymentMethod: "CASH", status: "COMPLETED", paidAt: now,
            }],
          },
        },
      });

      await prisma.sale.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          branchId: branchA,
          saleNumber: "SAL-DF-B",
          subtotal: 300,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 300,
          totalCost: 150,
          grossProfit: 150,
          status: "COMPLETED",
          paymentStatus: "PAID",
          deviceId: "DF-DEVICE-B",
          operationId: "DF-OP-B",
          idempotencyKey: "DF-IDEM-B-" + variantB,
          soldById: userA,
          soldAt: now,
          lines: {
            create: [{
              id: randomUUID(), productId: productB, variantId: variantB, quantity: 3,
              unitPrice: 100, unitCost: 50, discountAmount: 0, taxAmount: 0, lineTotal: 300,
            }],
          },
          payments: {
            create: [{
              id: randomUUID(), tenantId: tenantA, branchId: branchA, paymentNumber: "PAY-DF-B",
              amount: 300, paymentMethod: "MOBILE_MONEY", status: "COMPLETED", paidAt: now,
            }],
          },
        },
      });

      await prisma.sale.create({
        data: {
          id: saleB,
          tenantId: tenantB,
          branchId: branchB,
          saleNumber: "SAL-DF-ROGUE",
          subtotal: 1000,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 1000,
          totalCost: 400,
          grossProfit: 600,
          status: "COMPLETED",
          paymentStatus: "PAID",
          deviceId: "DF-ROGUE",
          operationId: "DF-ROGUE",
          idempotencyKey: "DF-ROGUE-" + saleB,
          soldAt: now,
        },
      });

      // Cross-tenant records are intentionally malformed at the ownership layer.
      // The dashboard must not count them merely because the foreign key IDs resolve.
      await prisma.payment.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          branchId: branchA,
          paymentNumber: "PAY-DF-CROSS",
          saleId: saleB,
          amount: 9999,
          paymentMethod: "CARD",
          status: "COMPLETED",
          paidAt: now,
        },
      });
      await prisma.return.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          branchId: branchA,
          returnNumber: "RET-DF-CROSS",
          originalSaleId: saleB,
          reason: "Cross-tenant isolation test",
          refundType: "CASH",
          totalRefundAmount: 777,
          status: "COMPLETED",
          createdAt: now,
          lines: {
            create: [{
              id: randomUUID(),
              variantId: variantB,
              quantityReturned: 1,
              refundUnitPrice: 777,
              refundLineTotal: 777,
              condition: "GOOD",
            }],
          },
        },
      });

      const snapshot = await getDashboardKpiSnapshot(ctx, "7d");

      expect(snapshot.salesToday).toBe(800);
      expect(snapshot.grossSalesToday).toBe(800);
      expect(snapshot.refundsToday).toBe(0);
      expect(snapshot.cogsToday).toBe(450);
      expect(snapshot.grossProfit).toBe(350);
      expect(snapshot.analytics.totalRevenue).toBe(800);
      expect(snapshot.analytics.totalCOGS).toBe(450);
      expect(snapshot.analytics.totalProfit).toBe(350);

      expect(snapshot.analytics.paymentTotalVolume).toBe(800);
      expect(snapshot.analytics.paymentTotalCount).toBe(2);
      expect(snapshot.analytics.paymentTotalOrderCount).toBe(2);
      expect(snapshot.analytics.paymentOverallAov).toBe(400);
      expect(snapshot.analytics.paymentChannels.find((x) => x.name === "CASH")?.volume).toBe(500);
      expect(snapshot.analytics.paymentChannels.find((x) => x.name === "MOBILE_MONEY")?.volume).toBe(300);
      expect(snapshot.analytics.paymentChannels.find((x) => x.name === "CARD")).toBeUndefined();

      const revenueLeader = snapshot.analytics.topProducts.find((x) => x.productId === productA);
      const unitsLeader = snapshot.analytics.topProducts.find((x) => x.productId === productB);
      expect(revenueLeader?.revenueRank).toBe(1);
      expect(unitsLeader?.unitsRank).toBe(1);
      expect(revenueLeader?.revenue).toBe(500);
      expect(unitsLeader?.units).toBe(3);

      const repository = new PrismaCommercialRepository();
      const recentOrders = await repository.getSales(ctx);
      expect(recentOrders).toHaveLength(2);
      expect(recentOrders.find((sale: any) => sale.id === saleA)?.cashierName).toBe("Amani Dashboard Cashier");
      expect(recentOrders.every((sale: any) => sale.tenantId === tenantA && sale.branchId === branchA)).toBe(true);
    } finally {
      await prisma.returnLine.deleteMany({ where: { returnRel: { tenantId: { in: [tenantA, tenantB] } } } });
      await prisma.return.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.payment.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.saleLine.deleteMany({ where: { sale: { tenantId: { in: [tenantA, tenantB] } } } });
      await prisma.sale.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.productVariant.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.product.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.role.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.branch.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    }
  });

  it("keeps dashboard day/hour boundaries deterministic at UTC midnight", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const saleBeforeMidnight = randomUUID();
    const saleAfterMidnight = randomUUID();
    const ctx: any = { tenantId, branchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] };
    const now = new Date();
    const utcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const beforeMidnight = new Date(utcDay.getTime() + 23 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const afterMidnight = new Date(utcDay.getTime() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000);

    try {
      await prisma.tenant.create({
        data: { id: tenantId, name: "Dashboard UTC Boundary", slug: "dash-utc-" + tenantId.slice(0, 8) },
      });
      await prisma.branch.create({
        data: { id: branchId, tenantId, name: "UTC Boundary", code: "UTC-" + branchId.slice(0, 8) },
      });

      for (const [id, soldAt, amount] of [
        [saleBeforeMidnight, beforeMidnight, 123],
        [saleAfterMidnight, afterMidnight, 456],
      ] as const) {
        await prisma.sale.create({
          data: {
            id, tenantId, branchId, saleNumber: "UTC-" + id.slice(0, 8),
            subtotal: amount, discountTotal: 0, taxTotal: 0, grandTotal: amount,
            totalCost: 0, grossProfit: amount, status: "COMPLETED", paymentStatus: "PAID",
            deviceId: "UTC-TEST", operationId: id, idempotencyKey: "UTC-IDEM-" + id, soldAt,
          },
        });
      }

      const snapshot = await getDashboardKpiSnapshot(ctx, "today");
      expect(snapshot.salesToday).toBe(123);
      expect(snapshot.todayOrderCount).toBe(1);
      expect(snapshot.analytics.chartPoints).toHaveLength(1);
      expect(snapshot.analytics.chartPoints[0]?.Revenue).toBe(123);
      expect(snapshot.analytics.peakHour?.hour).toBe("23:00");
    } finally {
      await prisma.sale.deleteMany({ where: { id: { in: [saleBeforeMidnight, saleAfterMidnight] } } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  });

});
