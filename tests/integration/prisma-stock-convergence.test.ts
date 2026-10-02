import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";

describe("PostgreSQL multi-device stock convergence", () => {
  it("converges +40 and +60 to ledger 100 and projection 100", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const now = new Date().toISOString();
    const ctx = { tenantId, branchId, userId: "CONVERGENCE", roles: ["ADMIN"], permissions: ["*"] } as any;
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Convergence Test", slug: "conv-" + tenantId.slice(0, 12) } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "CONV", isMain: true } });
      await prisma.product.create({ data: { id: productId, tenantId, branchId, name: "Convergence Item", sku: "CONV-ITEM", category: "", hasVariants: true } });
      await prisma.productVariant.create({ data: { id: variantId, tenantId, branchId, productId, name: "Standard", sku: "CONV-STD", price: 100, costPrice: 50 } });
      const engineA = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
      const engineB = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
      const opA = { operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE" as const, payload: { variantId, productId, adjustmentType: "INCREASE", quantityChange: 40, reason: "Device A", unitCost: 50 }, clientCreatedAt: now, idempotencyKey: "CONV-A-" + randomUUID() };
      const opB = { operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE" as const, payload: { variantId, productId, adjustmentType: "INCREASE", quantityChange: 60, reason: "Device B", unitCost: 50 }, clientCreatedAt: now, idempotencyKey: "CONV-B-" + randomUUID() };
      const [a, b] = await Promise.all([
        engineA.processPush(ctx, { deviceId: "DEVICE-A", operations: [opA] }),
        engineB.processPush(ctx, { deviceId: "DEVICE-B", operations: [opB] }),
      ]);
      expect(a.results[0].status).toBe("SUCCESS");
      expect(b.results[0].status).toBe("SUCCESS");
      const rows = await prisma.stockLedger.findMany({ where: { tenantId, branchId, variantId }, orderBy: { occurredAt: "asc" } });
      expect(rows).toHaveLength(2);
      expect(rows.reduce((sum, row) => sum + Number(row.quantityChange), 0)).toBe(100);
      const persisted = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(Number(persisted?.inventoryQuantity)).toBe(100);
      const product = await prisma.product.findUnique({ where: { id: productId } });
      expect(Number(product?.totalStock)).toBe(100);
      expect(Number(product?.availableStock)).toBe(100);
      const branchStock = await prisma.productBranchStock.findFirst({ where: { tenantId, branchId, variantId, warehouseId: null } });
      expect(Number(branchStock?.currentQuantity ?? 0)).toBe(100);
      expect(Number((await prisma.stockLedger.aggregate({ where: { tenantId, branchId, variantId }, _sum: { quantityChange: true } }))._sum.quantityChange ?? 0)).toBe(Number(persisted?.inventoryQuantity ?? 0));
      const replay = await engineA.processPush(ctx, { deviceId: "DEVICE-A", operations: [opA] });
      expect(replay.results[0].status).toBe("ALREADY_PROCESSED");
      const rowsAfterReplay = await prisma.stockLedger.findMany({ where: { tenantId, branchId, variantId } });
      expect(rowsAfterReplay).toHaveLength(2);
    } finally {
      await prisma.syncOperation.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockAdjustment.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockLedger.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.productVariant.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
  });
});
