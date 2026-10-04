import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";

describe("Product authoritative persistence lifecycle", () => {
  it("persists create/edit/archive/variants/price history/stock through PostgreSQL and bootstrap+delta", async () => {
    const tenantId = randomUUID(); const branchId = randomUUID(); const productId = randomUUID(); const v1 = randomUUID(); const v2 = randomUUID();
    const ctx = { tenantId, branchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] };
    const repo = new PrismaProductRepository(); const stock = new PrismaStockRepository(); const sync = new PrismaSyncEngine(repo, stock);
    const client = new LocalIndexedDbStore(4, `test-product-lifecycle-${tenantId}`); await client.ready;
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Product Lifecycle", slug: `prod-${tenantId.slice(0,8)}` } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: `P-${branchId.slice(0,6)}` } });
      const now = new Date().toISOString();
      const create = await sync.processPush(ctx, { deviceId: "TEST", operations: [{ operationId: randomUUID(), entityType: "Product", entityId: productId, operationType: "CREATE", idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
        id: productId, name: "Authority Product", sku: `AUTH-${productId.slice(0,6)}`, category: "General", buyingPrice: 100, sellingPrice: 150, hasVariants: true,
        variants: [
          { id: v1, name: "Small", sku: `AUTH-S-${v1.slice(0,6)}`, price: 150, costPrice: 100, inventoryQuantity: 0, stock: 0, reorderLevel: 2, isActive: true },
          { id: v2, name: "Large", sku: `AUTH-L-${v2.slice(0,6)}`, price: 170, costPrice: 110, inventoryQuantity: 0, stock: 0, reorderLevel: 3, isActive: true },
        ]
      }}] });
      expect(create.results[0].status).toBe("SUCCESS");
      const stockPush = await sync.processPush(ctx, { deviceId: "TEST", operations: [{ operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE", idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { variantId: v1, adjustmentType: "INCREASE", quantityChange: 7, reason: "OPENING_STOCK" } }] });
      expect(stockPush.results[0].status).toBe("SUCCESS");
      const beforeEdit = await repo.getProductById(ctx, productId); expect(beforeEdit?.variants.find(v=>v.id===v1)?.stock).toBe(7); expect(beforeEdit?.totalStock).toBe(7);
      const edit = await sync.processPush(ctx, { deviceId: "TEST", operations: [{ operationId: randomUUID(), entityType: "Product", entityId: productId, operationType: "UPDATE", idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { buyingPrice: 125, sellingPrice: 200, hasVariants: true, name: "Authority Product Edited", isActive: true } }] });
      expect(edit.results[0].status).toBe("SUCCESS");
      const persisted = await repo.getProductById(ctx, productId); expect(persisted?.buyingPrice).toBe(125); expect(persisted?.sellingPrice).toBe(200); expect(persisted?.name).toBe("Authority Product Edited");
      const variantEdit = await sync.processPush(ctx, { deviceId: "TEST", operations: [{ operationId: randomUUID(), entityType: "ProductVariant", entityId: v1, operationType: "UPDATE", idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { name: "Small Edited", reorderLevel: 4, attributes: { size: "S" }, price: 210, costPrice: 130, isActive: true } }] });
      expect(variantEdit.results[0].status).toBe("SUCCESS");
      const ph = await repo.recordPriceChange(ctx, { productId, newBuyingPrice: 130, newSellingPrice: 210, changeType: "MANUAL_ADJUSTMENT", changeReason: "Lifecycle test", deviceId: "TEST", operationId: randomUUID(), idempotencyKey: randomUUID() });
      expect(ph.newSellingPrice).toBe(210);
      const histories = await repo.getPriceHistory(ctx, productId); expect(histories.length).toBeGreaterThanOrEqual(1);
      const bootstrap = await sync.processBootstrap(ctx, { deviceId: "CLIENT2", schemaVersion: client.schemaVersion }); await client.bootstrapFromAuthoritativeSnapshot(bootstrap, { tenantId, branchId });
      const localProduct = client.products.get(productId) as any; expect(localProduct.name).toBe("Authority Product Edited"); expect(Number(localProduct.sellingPrice)).toBe(210); expect((client.productVariants.get(v1) as any).reorderLevel).toBe(4);
      const variantDelete = await sync.processPush(ctx, { deviceId: "TEST", operations: [{ operationId: randomUUID(), entityType: "ProductVariant", entityId: v2, operationType: "DELETE", idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { _baseUpdatedAt: (await prisma.productVariant.findUnique({where:{id:v2}}))!.updatedAt.toISOString() } }] });
      expect(variantDelete.results[0].status).toBe("SUCCESS");
      const archive = await sync.processPush(ctx, { deviceId: "TEST", operations: [{ operationId: randomUUID(), entityType: "Product", entityId: productId, operationType: "UPDATE", idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { isActive: false } }] });
      expect(archive.results[0].status).toBe("SUCCESS");
      const delta = await sync.processDelta(ctx, { since: new Date(Date.now()-60000).toISOString() });
      expect(delta.products.some(p=>p.id===productId && p.isActive===false)).toBe(true);
      expect(delta.variants.some((v:any)=>v.id===v2 && v.isActive===false)).toBe(true);
      expect(delta.priceHistories?.some((h:any)=>h.productId===productId && h.newSellingPrice===210)).toBe(true);
      await client.applyServerDelta(delta);
      expect((client.products.get(productId) as any).isActive).toBe(false); expect((client.productVariants.get(v2) as any).isActive).toBe(false);
    } finally {
      await prisma.productPriceHistory.deleteMany({ where: { tenantId: tenantId } });
      await prisma.stockLedger.deleteMany({ where: { tenantId: tenantId } });
      await prisma.stockAdjustment.deleteMany({ where: { tenantId: tenantId } });
      await prisma.productVariant.deleteMany({ where: { tenantId: tenantId } });
      await prisma.product.deleteMany({ where: { tenantId: tenantId } });
      await prisma.branch.deleteMany({ where: { tenantId: tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  }, 30000);
});
