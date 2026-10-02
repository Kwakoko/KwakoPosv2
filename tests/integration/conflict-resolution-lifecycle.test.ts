import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  prisma,
  PrismaProductRepository,
  PrismaStockRepository,
} from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";

describe("Conflict resolution lifecycle: PostgreSQL authority", () => {
  it("detects, lists, resolves, audits and converges stale conflicts without replay", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const userId = randomUUID();
    const productId = randomUUID();
    const categoryId = randomUUID();
    const categoryReplacementId = randomUUID();
    const brandId = randomUUID();
    const customerId = randomUUID();
    const parentProductId = randomUUID();
    const childProductId = randomUUID();
    const parentVariantId = randomUUID();
    const childVariantId = randomUUID();
    const ctx: any = { tenantId, branchId, userId, roles: ["ADMIN"], permissions: ["*"] };
    const sync = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());

    try {
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Conflict Resolution Test",
          slug: "conflict-" + tenantId.slice(0, 8),
          branches: { create: { id: branchId, name: "Main", code: "CR-" + branchId.slice(0, 6) } },
        },
      });
      await prisma.category.createMany({
        data: [
          { id: categoryId, tenantId, branchId, name: "Original", code: "ORIGINAL" },
          { id: categoryReplacementId, tenantId, branchId, name: "Replacement", code: "REPLACEMENT" },
        ],
      });
      await prisma.brand.create({
        data: { id: brandId, tenantId, branchId, name: "Brand", code: "BRAND" },
      });
      await prisma.customer.create({
        data: { id: customerId, tenantId, branchId, customerCode: "C-" + customerId.slice(0, 8), name: "Conflict Customer" },
      });
      await prisma.product.create({
        data: {
          id: productId, tenantId, branchId, name: "Server Product", sku: "SERVER-PROD",
          categoryId, category: "Original", buyingPrice: 10, sellingPrice: 20, isActive: true,
        },
      });

      const productBase = (await prisma.product.findUnique({ where: { id: productId } }))!.updatedAt;
      await prisma.product.update({ where: { id: productId }, data: { name: "Server New" } });
      const staleProduct = await sync.processPush(ctx, {
        deviceId: "DEVICE-A",
        operations: [{
          operationId: "stale-product-" + productId,
          entityType: "Product",
          entityId: productId,
          operationType: "UPDATE",
          payload: {
            _baseUpdatedAt: productBase.toISOString(),
            name: "Local New",
            sku: "SERVER-PROD",
            categoryId,
            category: "Original",
            buyingPrice: 10,
            sellingPrice: 20,
            isActive: true,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "idem-stale-product-" + productId,
        }],
      });
      expect(staleProduct.results[0].status).toBe("FAILED");
      expect(staleProduct.results[0].error).toMatch(/^SYNC_CONFLICT:/);
      const productConflictId = String(staleProduct.results[0].error).slice("SYNC_CONFLICT:".length);

      const openAfterProduct = await sync.listConflicts(ctx);
      expect(openAfterProduct.some((c: any) => c.id === productConflictId && c.entityType === "Product")).toBe(true);

      const resolvedProduct = await sync.resolveConflict(ctx, productConflictId, "ACCEPT_LOCAL");
      expect(resolvedProduct.status).toBe("RESOLVED");
      expect(resolvedProduct.revision).toBeTruthy();
      expect((await prisma.product.findUnique({ where: { id: productId } }))?.name).toBe("Local New");

      const productAudit = await prisma.auditEvent.findMany({
        where: { tenantId, branchId, entityId: productId },
        orderBy: { createdAt: "asc" },
      });
      expect(productAudit.map((row) => row.action)).toEqual([
        "SYNC_CONFLICT_DETECTED",
        "SYNC_CONFLICT_RESOLVED",
      ]);
      const closed = await sync.listConflicts(ctx, "ALL");
      expect(closed.find((c: any) => c.id === productConflictId)?.status).toBe("ACCEPT_LOCAL");

      const customerBase = (await prisma.customer.findUnique({ where: { id: customerId } }))!.updatedAt;
      await prisma.customer.update({ where: { id: customerId }, data: { phone: "+255700000001" } });
      const staleCustomer = await sync.processPush(ctx, {
        deviceId: "DEVICE-B",
        operations: [{
          operationId: "stale-customer-" + customerId,
          entityType: "Customer",
          entityId: customerId,
          operationType: "UPDATE",
          payload: {
            _baseUpdatedAt: customerBase.toISOString(),
            name: "Conflict Customer",
            customerCode: "C-" + customerId.slice(0, 8),
            phone: "+255700000002",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "idem-stale-customer-" + customerId,
        }],
      });
      const customerConflictId = String(staleCustomer.results[0].error).slice("SYNC_CONFLICT:".length);
      const mergedCustomer = await sync.resolveConflict(ctx, customerConflictId, "MERGE", {
        name: "Conflict Customer",
        customerCode: "C-" + customerId.slice(0, 8),
        phone: "+255700000002",
        email: "merged@example.test",
      });
      expect(mergedCustomer.status).toBe("RESOLVED");
      const savedCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
      expect(savedCustomer?.phone).toBe("+255700000002");
      expect(savedCustomer?.email).toBe("merged@example.test");

      const categoryBase = (await prisma.category.findUnique({ where: { id: categoryId } }))!.updatedAt;
      await prisma.category.update({ where: { id: categoryId }, data: { name: "Server Category", code: "SERVER-CATEGORY" } });
      const staleCategory = await sync.processPush(ctx, {
        deviceId: "DEVICE-C",
        operations: [{
          operationId: "stale-category-" + categoryId,
          entityType: "Category",
          entityId: categoryId,
          operationType: "UPDATE",
          payload: {
            _baseUpdatedAt: categoryBase.toISOString(),
            name: "Local Category",
            code: "LOCAL-CATEGORY",
            parentId: null,
            isActive: true,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "idem-stale-category-" + categoryId,
        }],
      });
      const categoryConflictId = String(staleCategory.results[0].error).slice("SYNC_CONFLICT:".length);
      await sync.resolveConflict(ctx, categoryConflictId, "ACCEPT_LOCAL");
      expect((await prisma.category.findUnique({ where: { id: categoryId } }))?.name).toBe("Local Category");

      await prisma.product.create({
        data: {
          id: parentProductId, tenantId, branchId, name: "Parent", sku: "PARENT",
          buyingPrice: 5, sellingPrice: 10, isActive: true,
        },
      });
      await prisma.product.create({
        data: {
          id: childProductId, tenantId, branchId, name: "Child", sku: "CHILD",
          buyingPrice: 2, sellingPrice: 4, isActive: true,
        },
      });
      await prisma.productVariant.create({
        data: {
          id: parentVariantId, tenantId, branchId, productId: parentProductId, name: "Parent Variant",
          sku: "PARENT-V", price: 10, costPrice: 5, inventoryQuantity: 0, isActive: true,
        },
      });
      await prisma.productVariant.create({
        data: {
          id: childVariantId, tenantId, branchId, productId: childProductId, name: "Child Variant",
          sku: "CHILD-V", price: 4, costPrice: 2, inventoryQuantity: 0, isActive: true,
        },
      });
      const conversion = await sync.processPush(ctx, {
        deviceId: "DEVICE-D",
        operations: [{
          operationId: "conversion-conflict-" + randomUUID(),
          entityType: "UnitConversionTransaction",
          entityId: randomUUID(),
          operationType: "CREATE",
          payload: {
            parentVariantId,
            childVariantId,
            parentUnitsDeducted: 5,
            childUnitsProduced: 10,
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "conversion-conflict-" + randomUUID(),
        }],
      });
      expect(conversion.results[0].status).toBe("FAILED");
      const conversionConflictId = String(conversion.results[0].error).slice("SYNC_CONFLICT:".length);
      expect((await sync.listConflicts(ctx)).some((c: any) => c.id === conversionConflictId)).toBe(true);
      const acceptedConversion = await sync.resolveConflict(ctx, conversionConflictId, "ACCEPT_SERVER");
      expect(acceptedConversion.status).toBe("RESOLVED");

      // Client-side conflict state must be durable and must not be replayed after resolution.
      const localDb = new LocalIndexedDbStore();
      await localDb.ready;
      localDb.recordOutboxMutation({
        id: "client-conflict-op",
        entityType: "Product",
        entityId: productId,
        operationType: "UPDATE",
        payload: { name: "Local" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "client-conflict-op",
        status: "PENDING",
        tenantId,
        branchId,
      } as any, { tenantId, branchId });
      localDb.markOutboxFailed("client-conflict-op", "SYNC_CONFLICT:" + productConflictId);
      expect(localDb.getFailedOutbox(tenantId, branchId).length).toBe(1);
      localDb.markOutboxConflictResolved("client-conflict-op", "ACCEPT_LOCAL");
      const resolvedOutbox = localDb.syncOutbox.get("client-conflict-op") as any;
      expect(resolvedOutbox.status).toBe("CONFLICT_RESOLVED");
      expect(localDb.getRetriableFailedOutbox(tenantId, branchId).length).toBe(0);

      expect(await sync.listConflicts(ctx)).not.toContainEqual(expect.objectContaining({ id: productConflictId }));
      expect(await prisma.auditEvent.count({ where: { tenantId, branchId, action: "SYNC_CONFLICT_RESOLVED" } })).toBeGreaterThanOrEqual(4);
    } finally {
      await prisma.auditEvent.deleteMany({ where: { tenantId } });
      await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId);
      await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id = $1", tenantId);
      await prisma.productVariant.deleteMany({ where: { tenantId } });
      await prisma.product.deleteMany({ where: { tenantId } });
      await prisma.customer.deleteMany({ where: { tenantId } });
      await prisma.category.deleteMany({ where: { tenantId } });
      await prisma.brand.deleteMany({ where: { tenantId } });
      await prisma.branch.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  });
});
