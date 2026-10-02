import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { WorldStandardPrismaSyncEngine } from "@kwakopos2/sync";
import { PrismaProductRepository, PrismaStockRepository, prisma } from "@kwakopos2/database";

describe("Two-till stock delta convergence", () => {
  it("converges out-of-order offline sales and preserves durable idempotency", async () => {
    const tenantId = `tenant-two-till-${randomUUID()}`;
    const branchId = `branch-two-till-${randomUUID()}`;
    const ctx = { tenantId, branchId, userId: `user-${randomUUID()}`, roles: ["CASHIER"], permissions: ["*"] };
    const engine = new WorldStandardPrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const productId = randomUUID();
    const variantId = randomUUID();
    const now = new Date().toISOString();
    await prisma.tenant.create({ data: {
      id: tenantId, name: "Two Till Test Tenant", slug: `two-till-${randomUUID()}`,
      branches: { create: { id: branchId, name: "Main", code: `TT-${branchId.slice(0, 6)}` } },
    }});

    const push = (deviceId: string, operationId: string, entityType: string, entityId: string, payload: any, operationType = "CREATE") =>
      engine.processPush(ctx as any, { deviceId, operations: [{ operationId, entityType, entityId, operationType, payload, clientCreatedAt: now, idempotencyKey: `${deviceId}/${operationId}` }] } as any);

    await prisma.product.create({ data: {
      id: productId, tenantId, branchId, name: "Two Till Test Product", sku: `TWO-${variantId}`,
      category: "General", buyingPrice: 5, sellingPrice: 10, isActive: true,
    }});
    await prisma.productVariant.create({ data: {
      id: variantId, tenantId, branchId, productId, name: "Default", sku: `VAR-${variantId}`,
      price: 10, costPrice: 5, inventoryQuantity: 0, isActive: true,
    }});

    const seed = await push("seed", "SEED-STOCK", "StockAdjustment", randomUUID(), {
      variantId, adjustmentType: "INCREASE", quantityChange: 100, reason: "Opening Stock",
    });
    expect(seed.results[0].status).toBe("SUCCESS");
    const rejectedAbsoluteStock = await push("till-A", "BAD-VARIANT-UPDATE", "ProductVariant", variantId, {
      name: "Default", inventoryQuantity: 999, stock: 999,
    }, "UPDATE");
    expect(rejectedAbsoluteStock.results[0].status).toBe("FAILED");
    expect(rejectedAbsoluteStock.results[0].error).toContain("INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER");

    const saleBId = randomUUID();
    const saleAId = randomUUID();
    const saleB = await push("till-B", "SALE-B", "StockAdjustment", saleBId, {
      variantId, adjustmentType: "DECREASE", quantityChange: 60, reason: "Offline Till B Sale",
    });
    const saleA = await push("till-A", "SALE-A", "StockAdjustment", saleAId, {
      variantId, adjustmentType: "DECREASE", quantityChange: 40, reason: "Offline Till A Sale",
    });
    expect(saleB.results[0].status).toBe("SUCCESS");
    expect(saleA.results[0].status).toBe("SUCCESS");

    const ledgers = await prisma.stockLedger.findMany({ where: { tenantId, branchId, variantId } });
    expect(ledgers.map((row: any) => Number(row.quantityChange)).sort((a, b) => a - b)).toEqual([-60, -40, 100]);
    expect(ledgers.reduce((sum: number, row: any) => sum + Number(row.quantityChange), 0)).toBe(0);
    const persistedVariant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(Number(persistedVariant?.inventoryQuantity ?? 0)).toBe(0);
    const branchStock = await prisma.productBranchStock.findFirst({ where: { tenantId, branchId, variantId, warehouseId: null } });
    expect(Number(branchStock?.currentQuantity ?? 0)).toBe(0);
    expect(Number((await prisma.stockLedger.aggregate({ where: { tenantId, branchId, variantId }, _sum: { quantityChange: true } }))._sum.quantityChange ?? 0)).toBe(Number(persistedVariant?.inventoryQuantity ?? 0));

    const replayB = await push("till-B", "SALE-B", "StockAdjustment", saleBId, {
      variantId, adjustmentType: "DECREASE", quantityChange: 60, reason: "Offline Till B Sale",
    });
    expect(replayB.results[0].status).toBe("ALREADY_PROCESSED");
  });
});
