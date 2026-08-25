import type { TenantContext, SyncPushRequest, SyncPushResponse, SyncDeltaRequest, SyncDeltaResponse } from "@kwakopos2/contracts";
import { PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database/prismaRepositories";
import { prisma } from "@kwakopos2/database";

export class PrismaSyncEngine {
  constructor(
    private readonly productRepo: PrismaProductRepository,
    private readonly stockRepo: PrismaStockRepository,
  ) {}

  async processPush(ctx: TenantContext, req: SyncPushRequest): Promise<SyncPushResponse> {
    const results: SyncPushResponse["results"] = [];
    let processedCount = 0;

    for (const op of req.operations) {
      const existing = await prisma.syncOperation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId, deviceId: req.deviceId }],
        },
      });
      if (existing) {
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
        continue;
      }

      try {
        if (op.entityType === "Product" && op.operationType === "CREATE") {
          await this.productRepo.createProduct(ctx, { ...(op.payload as any), id: op.entityId });
        } else if (op.entityType === "Product" && op.operationType === "UPDATE") {
          await this.productRepo.updateProduct(ctx, op.entityId, op.payload as any);
        } else if (op.entityType === "ProductVariant" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          await this.productRepo.addVariant(ctx, payload.productId, { ...payload, id: op.entityId });
        } else if (op.entityType === "ProductVariant" && op.operationType === "UPDATE") {
          await this.productRepo.updateVariant(ctx, op.entityId, op.payload as any);
        } else if (op.entityType === "ProductVariant" && op.operationType === "DELETE") {
          await this.productRepo.deleteVariant(ctx, op.entityId);
        } else if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") {
          await this.stockRepo.recordStockAdjustment(ctx, {
            ...(op.payload as any),
            id: op.entityId,
            deviceId: req.deviceId,
            operationId: op.operationId,
            idempotencyKey: op.idempotencyKey,
          });
        }

        await prisma.syncOperation.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            deviceId: req.deviceId,
            operationId: op.operationId,
            entityType: op.entityType,
            entityId: op.entityId,
            operationType: op.operationType,
            payload: op.payload as any,
            status: "PROCESSED",
            idempotencyKey: op.idempotencyKey,
            clientCreatedAt: new Date(op.clientCreatedAt),
            processedAt: new Date(),
          },
        });
        processedCount += 1;
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
      } catch (err: any) {
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: err?.message || "Sync operation failed" });
      }
    }

    return { processedCount, results };
  }

  async processDelta(ctx: TenantContext, req: SyncDeltaRequest): Promise<SyncDeltaResponse> {
    const since = req.since ? new Date(req.since) : new Date(0);
    const products = (await this.productRepo.getProducts(ctx)).filter((p) => new Date(p.updatedAt) >= since);
    const variants = await prisma.productVariant.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
    });
    const ledger = await this.stockRepo.getLedger(ctx);
    const adjustments = await prisma.stockAdjustment.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "asc" },
    });

    return {
      serverTimestamp: new Date().toISOString(),
      products,
      variants: variants.map((v: any) => ({
        id: v.id,
        tenantId: v.tenantId,
        branchId: v.branchId,
        productId: v.productId,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode ?? null,
        price: Number(v.price),
        costPrice: Number(v.costPrice),
        isActive: v.isActive,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
      stockLedger: ledger.filter((entry) => new Date(entry.createdAt) >= since),
      adjustments: adjustments.map((a: any) => ({
        id: a.id,
        tenantId: a.tenantId,
        branchId: a.branchId,
        variantId: a.variantId,
        adjustmentType: a.adjustmentType,
        quantityChange: Number(a.quantityChange),
        reason: a.reason,
        referenceNote: a.referenceNote ?? null,
        status: a.status,
        createdByUserId: a.createdByUserId,
        deviceId: a.deviceId,
        operationId: a.operationId,
        idempotencyKey: a.idempotencyKey,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    };
  }
}
