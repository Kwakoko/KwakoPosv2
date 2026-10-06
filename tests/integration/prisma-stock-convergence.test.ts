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
  }
  it("preserves backdated timestamps and historical lineage through authoritative sync", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const ctx = { tenantId, branchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] } as any;
    const engine = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const now = Date.now();
    const intakeAt = new Date(now - 40 * 24 * 3600 * 1000);
    const backdatedAt = new Date(now - 30 * 24 * 3600 * 1000);
    const saleAt = new Date(now - 20 * 24 * 3600 * 1000);

    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Backdated Sync Test", slug: "backdated-" + tenantId.slice(0, 12) } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "BACK", isMain: true } });
      await prisma.product.create({ data: { id: productId, tenantId, branchId, name: "Backdated Item", sku: "BACK-ITEM", category: "", hasVariants: true } });
      await prisma.productVariant.create({ data: { id: variantId, tenantId, branchId, productId, name: "Standard", sku: "BACK-STD", price: 120, costPrice: 50 } });

      const opening = await engine.processPush(ctx, {
        deviceId: "BACK-A",
        operations: [{
          operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE",
          payload: { variantId, productId, adjustmentType: "INCREASE", quantityChange: 50, reason: "Opening", unitCost: 50, occurredAt: intakeAt.toISOString() },
          clientCreatedAt: new Date().toISOString(), idempotencyKey: "BACK-OPEN-" + randomUUID(),
        }],
      });
      expect(opening.results[0].status).toBe("SUCCESS");

      const sale = await engine.processPush(ctx, {
        deviceId: "BACK-B",
        operations: [{
          operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE",
          payload: { variantId, productId, adjustmentType: "DECREASE", quantityChange: 10, reason: "Sale correction", unitCost: 50, occurredAt: saleAt.toISOString() },
          clientCreatedAt: new Date().toISOString(), idempotencyKey: "BACK-SALE-" + randomUUID(),
        }],
      });
      expect(sale.results[0].status).toBe("SUCCESS");

      const backdatedId = randomUUID();
      const backdated = await engine.processPush(ctx, {
        deviceId: "BACK-OFFLINE",
        operations: [{
          operationId: randomUUID(), entityType: "StockAdjustment", entityId: backdatedId, operationType: "CREATE",
          payload: { variantId, productId, adjustmentType: "INCREASE", quantityChange: 20, reason: "Discovered delivery note", unitCost: 50, occurredAt: backdatedAt.toISOString() },
          clientCreatedAt: new Date().toISOString(), idempotencyKey: "BACK-HIST-" + randomUUID(),
        }],
      });
      expect(backdated.results[0].status).toBe("SUCCESS");

      const historicalRow = await prisma.stockLedger.findUnique({ where: { id: backdatedId } });
      expect(historicalRow).not.toBeNull();
      expect(historicalRow?.occurredAt.toISOString()).toBe(backdatedAt.toISOString());
      expect(Number(historicalRow?.quantityBefore)).toBe(50);
      expect(Number(historicalRow?.quantityAfter)).toBe(70);

      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(Number(variant?.inventoryQuantity)).toBe(60);
      const atBackdated = await prisma.stockLedger.findMany({
        where: { tenantId, branchId, variantId, occurredAt: { lte: backdatedAt } },
      });
      expect(atBackdated.reduce((sum, row) => sum + Number(row.quantityChange), 0)).toBe(70);
    } finally {
      await prisma.syncOperation.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockAdjustment.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockLedger.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.productVariant.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.fiscalYear.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
  });

  it("rejects backdated mutations into locked accounting periods and without explicit permission", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const fiscalYearId = randomUUID();
    const periodDate = new Date(Date.now() - 15 * 24 * 3600 * 1000);
    const ctx = { tenantId, branchId, userId: randomUUID(), roles: ["MANAGER"], permissions: ["INVENTORY_ADJUST"] } as any;
    const engine = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());

    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Backdated Policy Test", slug: "backpolicy-" + tenantId.slice(0, 12) } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "POLICY", isMain: true } });
      await prisma.fiscalYear.create({
        data: { id: fiscalYearId, tenantId, name: "FY-BACK-POLICY", startDate: new Date(Date.now() - 365*24*3600*1000), endDate: new Date(Date.now() + 365*24*3600*1000), status: "OPEN", isClosed: false },
      });
      await prisma.accountingPeriod.create({
        data: { tenantId, fiscalYearId, periodNumber: 1, name: "BACK-LOCKED", startDate: new Date(Date.now() - 30*24*3600*1000), endDate: new Date(Date.now() - 1*24*3600*1000), status: "LOCKED", isClosed: true },
      });
      await prisma.product.create({ data: { id: productId, tenantId, branchId, name: "Policy Item", sku: "POLICY-ITEM", category: "", hasVariants: true } });
      await prisma.productVariant.create({ data: { id: variantId, tenantId, branchId, productId, name: "Standard", sku: "POLICY-STD", price: 100, costPrice: 50 } });

      const result = await engine.processPush(ctx, {
        deviceId: "BACK-POLICY",
        operations: [{
          operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE",
          payload: { variantId, productId, adjustmentType: "INCREASE", quantityChange: 5, reason: "Should be blocked", occurredAt: periodDate.toISOString() },
          clientCreatedAt: new Date().toISOString(), idempotencyKey: "BACK-POLICY-" + randomUUID(),
        }],
      });
      expect(result.results[0].status).toBe("FAILED");
      expect(result.results[0].error).toMatch(/INVENTORY_BACKDATE_PERMISSION_REQUIRED/);

      const allowedCtx = { ...ctx, userId: randomUUID(), permissions: ["INVENTORY_BACKDATE"] };
      const lockedResult = await engine.processPush(allowedCtx, {
        deviceId: "BACK-POLICY-ALLOWED",
        operations: [{
          operationId: randomUUID(), entityType: "StockAdjustment", entityId: randomUUID(), operationType: "CREATE",
          payload: { variantId, productId, adjustmentType: "INCREASE", quantityChange: 5, reason: "Still blocked by period", occurredAt: periodDate.toISOString() },
          clientCreatedAt: new Date().toISOString(), idempotencyKey: "BACK-POLICY-LOCKED-" + randomUUID(),
        }],
      });
      expect(lockedResult.results[0].status).toBe("FAILED");
      expect(lockedResult.results[0].error).toMatch(/ACCOUNTING_PERIOD_LOCKED/);
    } finally {
      await prisma.syncOperation.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockAdjustment.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockLedger.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.productVariant.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.accountingPeriod.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.fiscalYear.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
  });

});
