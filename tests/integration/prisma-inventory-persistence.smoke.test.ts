import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";

describe("Prisma inventory persistence smoke", () => {
  it("persists Product + Variant through real Prisma sync path", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const ctx = { tenantId, branchId, userId: "SMOKE", roles: ["ADMIN"], permissions: ["*"] };
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Persistence Smoke", slug: `persist-${Date.now()}-${tenantId.slice(0, 6)}` } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: `M${tenantId.slice(0, 5)}`, isMain: true } });
      const engine = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
      const now = new Date().toISOString();
      const result = await engine.processPush(ctx, { deviceId: "SMOKE", operations: [
        { operationId: `op-${productId}`, entityType: "Product", entityId: productId, operationType: "CREATE", payload: { id: productId, name: "Persistence Smoke", sku: `SMOKE-${productId.slice(0, 8)}`, category: "General", buyingPrice: 100, sellingPrice: 150, hasVariants: true }, clientCreatedAt: now, idempotencyKey: `idem-${productId}` },
        { operationId: `op-${variantId}`, entityType: "ProductVariant", entityId: variantId, operationType: "CREATE", payload: { id: variantId, productId, name: "Standard", sku: `SMOKE-V-${variantId.slice(0, 8)}`, price: 150, costPrice: 100, isActive: true }, clientCreatedAt: now, idempotencyKey: `idem-${variantId}` },
      ] });
      expect(result.results.map((r) => r.status)).toEqual(["SUCCESS", "SUCCESS"]);
      const persisted = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
      expect(persisted?.name).toBe("Persistence Smoke");
      expect(persisted?.variants.map((v) => v.id)).toContain(variantId);
    } finally {
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  });
});
