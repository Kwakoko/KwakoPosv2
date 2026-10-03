import { describe, expect, it } from "vitest";
import { prisma, PrismaStockRepository } from "@kwakopos2/database";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

describe("ProductVariantBalance projection", () => {
  it("tracks ledger aggregates per variant and rejects negative inventory", async () => {
    const tenantId = randomUUID(), branchId = randomUUID(), productId = randomUUID();
    const variantA = randomUUID(), variantB = randomUUID();
    const ctx = { tenantId, branchId, userId: "BALANCE-TEST", roles: ["ADMIN"], permissions: ["*"] };
    const repo = new PrismaStockRepository();
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Balance Test", slug: `balance-${tenantId.slice(0, 8)}` } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: `BL-${tenantId.slice(0, 6)}`, isMain: true } });
      await prisma.product.create({ data: { id: productId, tenantId, branchId, name: "Balance Product", sku: `BAL-${productId.slice(0, 8)}` } });
      await prisma.productVariant.create({ data: { id: variantA, tenantId, branchId, productId, name: "A", sku: `BAL-A-${variantA.slice(0, 8)}` } });
      await prisma.productVariant.create({ data: { id: variantB, tenantId, branchId, productId, name: "B", sku: `BAL-B-${variantB.slice(0, 8)}` } });
      const movement = (variantId: string, quantityChange: number, unitCost: number, tag: string) =>
        repo.recordMovement(ctx, { variantId, quantityChange, unitCost, movementType: "ADJUSTMENT_GAIN", referenceType: "TEST",
          referenceId: tag, deviceId: "balance-test", operationId: tag, idempotencyKey: tag });
      await movement(variantA, 10, 5, "a-1");
      await movement(variantB, 7, 8, "b-1");
      await movement(variantA, -2, 5, "a-2");
      const balanceA = await prisma.productVariantBalance.findUnique({ where: {
        tenantId_branchId_variantId: { tenantId, branchId, variantId: variantA } } });
      const balanceB = await prisma.productVariantBalance.findUnique({ where: {
        tenantId_branchId_variantId: { tenantId, branchId, variantId: variantB } } });
      const sumA = await prisma.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId, branchId, variantId: variantA } });
      const sumB = await prisma.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId, branchId, variantId: variantB } });
      expect(Number(balanceA?.currentQuantity)).toBe(Number(sumA._sum.quantityChange));
      expect(Number(balanceB?.currentQuantity)).toBe(Number(sumB._sum.quantityChange));
      expect(Number(balanceA?.currentQuantity)).toBe(8);
      expect(Number(balanceB?.currentQuantity)).toBe(7);
      await expect(movement(variantA, -9, 5, "a-negative")).rejects.toThrow("INSUFFICIENT_STOCK");
      const negativeRow = await prisma.stockLedger.findFirst({ where: { operationId: "a-negative" } });
      expect(negativeRow).toBeNull();
      const triggers = await prisma.$queryRaw(Prisma.sql`SELECT tgname FROM pg_trigger WHERE tgrelid = 'product_variant_balances'::regclass AND NOT tgisinternal`);
      expect(triggers).toEqual([]);
    } finally {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});
