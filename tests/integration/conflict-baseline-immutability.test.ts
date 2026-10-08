import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  prisma,
  PrismaProductRepository,
  PrismaStockRepository,
} from "@kwakopos2/database";
import { WorldStandardPrismaSyncEngine } from "@kwakopos2/sync";

describe("Conflict hardening: immutable conflict baseline", () => {
  it("does not advance an open conflict baseline on repeated registration", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();
    const operationId = "baseline-" + randomUUID();
    const conflictId = "conflict:" + operationId;
    const ctx: any = {
      tenantId,
      branchId,
      userId: randomUUID(),
      roles: ["ADMIN"],
      permissions: ["sync.conflict.resolve"],
    };
    const sync = new WorldStandardPrismaSyncEngine(
      new PrismaProductRepository(),
      new PrismaStockRepository(),
    );

    try {
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Conflict Baseline Test",
          slug: "baseline-" + tenantId.slice(0, 8),
          branches: { create: { id: branchId, name: "Main", code: "BL-" + branchId.slice(0, 6) } },
        },
      });
      await prisma.product.create({
        data: {
          id: productId,
          tenantId,
          branchId,
          name: "Server Product",
          sku: "BL-" + productId.slice(0, 8),
          buyingPrice: 10,
          sellingPrice: 20,
          isActive: true,
        },
      });

      const original = await prisma.product.findUnique({
        where: { id: productId },
        include: { variants: true },
      });
      expect(original?.name).toBe("Server Product");

      await sync.registerConflict(ctx, {
        conflictId,
        operationId,
        entityType: "Product",
        entityId: productId,
        operationType: "UPDATE",
        localPayload: {
          name: "Local Product",
          sku: original!.sku,
          _baseUpdatedAt: original!.updatedAt.toISOString(),
        },
        remotePayload: original,
        deviceId: "BASELINE-A",
      });

      await prisma.product.update({
        where: { id: productId },
        data: { name: "Server Changed After Detection" },
      });
      const changed = await prisma.product.findUnique({
        where: { id: productId },
        include: { variants: true },
      });

      await sync.registerConflict(ctx, {
        conflictId,
        operationId,
        entityType: "Product",
        entityId: productId,
        operationType: "UPDATE",
        localPayload: {
          name: "Local Product",
          sku: original!.sku,
          _baseUpdatedAt: original!.updatedAt.toISOString(),
        },
        remotePayload: changed,
        deviceId: "BASELINE-A",
      });

      const open = await sync.listConflicts(ctx);
      const stored = open.find((row: any) => row.id === conflictId);
      expect(stored?.remoteRecord?.name).toBe("Server Product");

      await expect(sync.resolveConflict(ctx, conflictId, "ACCEPT_LOCAL"))
        .rejects.toThrow("SYNC_CONFLICT_CHANGED_SINCE_DETECTION");

      const stillOpen = await sync.listConflicts(ctx);
      expect(stillOpen.some((row: any) => row.id === conflictId && row.status === "OPEN")).toBe(true);
    } finally {
      await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId).catch(() => {});
      await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id = $1", tenantId).catch(() => {});
      await prisma.syncOperation.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.auditEvent.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.productVariant.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { id: branchId, tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
  });
});
