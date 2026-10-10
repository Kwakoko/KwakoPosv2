import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";

describe("Inventory Production Lock durable lifecycle", () => {
  it("closes transfer, count, bundle, wastage and price paths through PostgreSQL + ledger", async () => {
    const tenantId = randomUUID();
    const sourceBranchId = randomUUID();
    const destinationBranchId = randomUUID();
    const sourceProductId = randomUUID();
    const sourceVariantId = randomUUID();
    const destProductId = randomUUID();
    const destVariantId = randomUUID();
    const componentProductId = randomUUID();
    const componentVariantId = randomUUID();
    const bundleProductId = randomUUID();
    const bundleVariantId = randomUUID();
    const transferId = randomUUID();
    const countId = randomUUID();
    const bundleId = randomUUID();
    const wastageId = randomUUID();

    const sourceCtx = { tenantId, branchId: sourceBranchId, userId: "LOCK-SOURCE", roles: ["ADMIN"], permissions: ["*"] };
    const destinationCtx = { tenantId, branchId: destinationBranchId, userId: "LOCK-DEST", roles: ["ADMIN"], permissions: ["*"] };
    const sync = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Inventory Lock", slug: `inventory-lock-${tenantId.slice(0, 8)}` } });
      await prisma.branch.create({ data: { id: sourceBranchId, tenantId, name: "Source", code: `SRC-${sourceBranchId.slice(0, 6)}` } });
      await prisma.branch.create({ data: { id: destinationBranchId, tenantId, name: "Destination", code: `DST-${destinationBranchId.slice(0, 6)}` } });

      const now = new Date().toISOString();
      const sku = `LOCK-SKU-${tenantId.slice(0, 6)}`;
      const createSource = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "Product", entityId: sourceProductId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          id: sourceProductId, name: "Transfer Source", sku, category: "General", buyingPrice: 100, sellingPrice: 160, hasVariants: true,
          variants: [{ id: sourceVariantId, name: "Default", sku, price: 160, costPrice: 100, inventoryQuantity: 0, isActive: true }],
        },
      }] });
      expect(createSource.results[0].status).toBe("SUCCESS");

      const createDestination = await sync.processPush(destinationCtx, { deviceId: "LOCK-DST", operations: [{
        operationId: randomUUID(), entityType: "Product", entityId: destProductId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          id: destProductId, name: "Transfer Destination", sku, category: "General", buyingPrice: 100, sellingPrice: 160, hasVariants: true,
          variants: [{ id: destVariantId, name: "Default", sku, price: 160, costPrice: 100, inventoryQuantity: 0, isActive: true }],
        },
      }] });
      expect(createDestination.results[0].status).toBe("SUCCESS");

      const seed = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { variantId: sourceVariantId, adjustmentType: "INCREASE", quantityChange: 10, reason: "OPENING_STOCK" },
      }] });
      expect(seed.results[0].status).toBe("SUCCESS");

      const transferCreate = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "StockTransfer", entityId: transferId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          sourceBranchId: sourceBranchId, destinationBranchId, transferNumber: `TRF-${transferId.slice(0, 8)}`,
          status: "SUBMITTED",
          items: [{ id: randomUUID(), productId: sourceProductId, variantId: sourceVariantId, quantity: 3, unitCost: 100 }],
        },
      }] });
      expect(transferCreate.results[0].status).toBe("SUCCESS");

      const deniedTransfer = await sync.processPush(destinationCtx, { deviceId: "LOCK-DST", operations: [{
        operationId: randomUUID(), entityType: "StockTransfer", entityId: randomUUID(), operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          sourceBranchId, destinationBranchId, transferNumber: `DENY-${randomUUID().slice(0, 8)}`,
          status: "SUBMITTED",
          items: [{ id: randomUUID(), productId: sourceProductId, variantId: sourceVariantId, quantity: 1, unitCost: 100 }],
        },
      }] });
      expect(deniedTransfer.results[0].status).toBe("FAILED");

      const transferReceive = await sync.processPush(destinationCtx, { deviceId: "LOCK-DST", operations: [{
        operationId: randomUUID(), entityType: "StockTransfer", entityId: transferId, operationType: "UPDATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { status: "RECEIVED" },
      }] });
      expect(transferReceive.results[0].status).toBe("SUCCESS");

      const sourceOut = await prisma.stockLedger.findMany({ where: { tenantId, branchId: sourceBranchId, referenceId: transferId } });
      const destIn = await prisma.stockLedger.findMany({ where: { tenantId, branchId: destinationBranchId, referenceId: transferId } });
      expect(sourceOut.map((x) => x.movementType)).toContain("TRANSFER_OUT");
      expect(destIn.map((x) => x.movementType)).toContain("TRANSFER_IN");
      expect(sourceOut.reduce((s, x) => s + Number(x.quantityChange), 0)).toBe(-3);
      expect(destIn.reduce((s, x) => s + Number(x.quantityChange), 0)).toBe(3);

      const countCreate = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "StockCount", entityId: countId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          name: "Lock Count", sessionNumber: `COUNT-${countId.slice(0, 8)}`, status: "COUNTING",
          lines: [{ id: randomUUID(), productId: sourceProductId, variantId: sourceVariantId, sku, productName: "Transfer Source", systemQuantity: 7, countedQuantity: null, varianceQuantity: 0, varianceValue: 0, unitCost: 100 }],
        },
      }] });
      expect(countCreate.results[0].status).toBe("SUCCESS");

      const countPost = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "StockCount", entityId: countId, operationType: "UPDATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          status: "POSTED",
          lines: [{ id: (await prisma.stockCountItem.findFirstOrThrow({ where: { countId } })).id, countedQuantity: 5 }],
        },
      }] });
      expect(countPost.results[0].status, JSON.stringify(countPost.results[0])).toBe("SUCCESS");
      const countPersisted = await prisma.stockCount.findUnique({ where: { id: countId }, include: { items: true } });
      expect(countPersisted?.status).toBe("POSTED");
      expect(Number(countPersisted?.items[0]?.varianceQuantity)).toBe(-2);
      const countLedger = await prisma.stockLedger.findMany({ where: { tenantId, branchId: sourceBranchId, referenceId: countId } });
      expect(countLedger.map((x) => x.movementType)).toContain("ADJUSTMENT_LOSS");

      const createComponent = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "Product", entityId: componentProductId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          id: componentProductId, name: "Component", sku: `COMP-${componentProductId.slice(0, 8)}`, category: "General", buyingPrice: 50, sellingPrice: 80, hasVariants: true,
          variants: [{ id: componentVariantId, name: "Default", sku: `COMP-${componentVariantId.slice(0, 8)}`, price: 80, costPrice: 50, inventoryQuantity: 0, isActive: true }],
        },
      }] });
      expect(createComponent.results[0].status).toBe("SUCCESS");
      await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { variantId: componentVariantId, adjustmentType: "INCREASE", quantityChange: 5, reason: "OPENING_STOCK" },
      }] });

      const createBundleParent = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "Product", entityId: bundleProductId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          id: bundleProductId, name: "Bundle Parent", sku: `BUNDLE-${bundleProductId.slice(0, 8)}`, category: "General", buyingPrice: 0, sellingPrice: 120, hasVariants: true,
          variants: [{ id: bundleVariantId, name: "Default", sku: `BUNDLE-${bundleVariantId.slice(0, 8)}`, price: 120, costPrice: 50, inventoryQuantity: 0, isActive: true }],
        },
      }] });
      expect(createBundleParent.results[0].status).toBe("SUCCESS");

      const bundleCreate = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "ProductBundle", entityId: bundleId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          productId: bundleProductId, name: "Kit of One", status: "ACTIVE",
          items: [{ id: randomUUID(), componentVariantId, quantity: 1 }],
          assembleQuantity: 2,
        },
      }] });
      expect(bundleCreate.results[0].status).toBe("SUCCESS");
      const bundleLedger = await prisma.stockLedger.findMany({ where: { tenantId, branchId: sourceBranchId, referenceId: bundleId } });
      expect(bundleLedger.map((x) => x.movementType)).toEqual(expect.arrayContaining(["PRODUCTION_USAGE", "PRODUCTION_OUTPUT"]));

      const wastage = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: randomUUID(), entityType: "WastageRecord", entityId: wastageId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: { variantId: sourceVariantId, quantity: 1, reason: "SPOILAGE" },
      }] });
      expect(wastage.results[0].status).toBe("SUCCESS");
      const persistedWastage = await prisma.wastageRecord.findUnique({ where: { id: wastageId } });
      expect(persistedWastage?.status).toBe("POSTED");
      const wastageLedger = await prisma.stockLedger.findUnique({ where: { id: persistedWastage!.ledgerId! } });
      expect(wastageLedger?.movementType).toBe("WASTAGE_SPILL");

      const priceId = randomUUID();
      const price = await sync.processPush(sourceCtx, { deviceId: "LOCK-SRC", operations: [{
        operationId: priceId, entityType: "ProductPriceHistory", entityId: priceId, operationType: "CREATE",
        idempotencyKey: randomUUID(), clientCreatedAt: now, payload: {
          productId: sourceProductId, variantId: sourceVariantId, newBuyingPrice: 120, newSellingPrice: 180,
          changeType: "MANUAL_ADJUSTMENT", changeReason: "Production lock test", effectiveFrom: now,
        },
      }] });
      expect(price.results[0].status).toBe("SUCCESS");
      const priceRow = await prisma.productPriceHistory.findUnique({ where: { id: priceId } });
      expect(Number(priceRow?.newSellingPrice)).toBe(180);

      const auditRows = await prisma.auditEvent.findMany({
        where: { tenantId, branchId: sourceBranchId, entityId: { in: [transferId, countId, bundleId, wastageId, priceId] } },
      });
      expect(auditRows.length).toBeGreaterThanOrEqual(5);
    } finally {
      await prisma.productPriceHistory.deleteMany({ where: { tenantId } });
      await prisma.wastageRecord.deleteMany({ where: { tenantId } });
      await prisma.productBundleItem.deleteMany({ where: { bundle: { tenantId } } });
      await prisma.productBundle.deleteMany({ where: { tenantId } });
      await prisma.stockCountItem.deleteMany({ where: { count: { tenantId } } });
      await prisma.stockCount.deleteMany({ where: { tenantId } });
      await prisma.stockTransferItem.deleteMany({ where: { transfer: { tenantId } } });
      await prisma.stockTransfer.deleteMany({ where: { tenantId } });
      await prisma.stockLedger.deleteMany({ where: { tenantId } });
      await prisma.stockAdjustment.deleteMany({ where: { tenantId } });
      await prisma.productVariant.deleteMany({ where: { tenantId } });
      await prisma.product.deleteMany({ where: { tenantId } });
      // AuditEvent is append-only by production policy, so tenant/branch fixtures are retained.
      // The test tenant contains no inventory/business rows after the cleanup above.
    }
  }, 60000);
});
