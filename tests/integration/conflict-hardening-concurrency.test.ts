import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";

describe("Conflict hardening: inventory concurrency", () => {
  it("serializes concurrent unit conversions on the same parent stock row", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const userId = randomUUID();
    const parentProductId = randomUUID();
    const childProductId = randomUUID();
    const parentVariantId = randomUUID();
    const childVariantId = randomUUID();
    const sync = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const ctx: any = { tenantId, branchId, userId, roles: ["ADMIN"], permissions: ["*"] };

    try {
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Conflict Hardening Concurrency",
          slug: "conv-" + tenantId.slice(0, 8),
          branches: { create: { id: branchId, name: "Main", code: "CV-" + branchId.slice(0, 6) } },
        },
      });
      await prisma.product.createMany({
        data: [
          { id: parentProductId, tenantId, branchId, name: "Parent", sku: "CV-P-" + parentProductId.slice(0, 8), buyingPrice: 5, sellingPrice: 10, isActive: true },
          { id: childProductId, tenantId, branchId, name: "Child", sku: "CV-C-" + childProductId.slice(0, 8), buyingPrice: 2, sellingPrice: 4, isActive: true },
        ],
      });
      await prisma.productVariant.createMany({
        data: [
          { id: parentVariantId, tenantId, branchId, productId: parentProductId, name: "Parent", sku: "CV-PV-" + parentVariantId.slice(0, 8), price: 10, costPrice: 5, inventoryQuantity: 0, isActive: true },
          { id: childVariantId, tenantId, branchId, productId: childProductId, name: "Child", sku: "CV-CV-" + childVariantId.slice(0, 8), price: 4, costPrice: 2, inventoryQuantity: 0, isActive: true },
        ],
      });

      const seedOp = "seed-" + randomUUID();
      await prisma.stockLedger.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId,
          productId: parentProductId,
          variantId: parentVariantId,
          movementType: "RECEIPT",
          quantityChange: 5,
          quantity: 5,
          quantityBefore: 0,
          quantityAfter: 5,
          unitCost: 5,
          totalCost: 25,
          referenceType: "TEST",
          referenceId: randomUUID(),
          occurredAt: new Date(),
          deviceId: "TEST",
          operationId: seedOp,
          idempotencyKey: seedOp,
        },
      });

      const conversion = (suffix: string) => ({
        deviceId: "CONC-" + suffix,
        operations: [{
          operationId: "conversion-conc-" + suffix + "-" + randomUUID(),
          entityType: "UnitConversionTransaction",
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { parentVariantId, childVariantId, parentUnitsDeducted: 4, childUnitsProduced: 4 },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "conversion-conc-idem-" + suffix + "-" + randomUUID(),
        }],
      });

      const [a, b] = await Promise.all([sync.processPush(ctx, conversion("A")), sync.processPush(ctx, conversion("B"))]);
      const results = [a.results[0], b.results[0]];

      expect(results.filter((r) => r?.status === "SUCCESS")).toHaveLength(1);
      expect(results.filter((r) => r?.status === "FAILED")).toHaveLength(1);
      expect(String(results.find((r) => r?.status === "FAILED")?.error || "")).toMatch(/CONVERSION_CONFLICT|SYNC_CONFLICT/);

      const parentLedgers = await prisma.stockLedger.findMany({ where: { tenantId, branchId, variantId: parentVariantId } });
      const parentBalance = parentLedgers.reduce((sum, row) => sum + Number(row.quantityChange), 0);
      expect(parentBalance).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId).catch(() => {});
      await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id = $1", tenantId).catch(() => {});
      await prisma.syncOperation.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.auditEvent.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.stockLedger.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.productVariant.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { id: branchId, tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
  });
});
