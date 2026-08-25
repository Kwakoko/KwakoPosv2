import type {
  TenantContext,
  SyncPushRequest,
  SyncPushResponse,
  SyncDeltaRequest,
  SyncDeltaResponse,
  SyncOperation,
  CreateProductRequest,
  CreateVariantRequest,
  CreateStockAdjustmentRequest,
} from "@kwakopos2/contracts";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";
import { randomUUID } from "crypto";

export class SyncEngine {
  private productRepo: ScopedProductRepository;
  private stockRepo: ScopedStockRepository;
  private store: InMemoryStore;

  constructor(productRepo: ScopedProductRepository, stockRepo: ScopedStockRepository, store: InMemoryStore = globalInMemoryStore) {
    this.productRepo = productRepo;
    this.stockRepo = stockRepo;
    this.store = store;
  }

  processPush(ctx: TenantContext, req: SyncPushRequest): SyncPushResponse {
    const results: SyncPushResponse["results"] = [];
    let processedCount = 0;
    for (const op of req.operations) {
      const existingOp = Array.from(this.store.syncOperations.values()).find((o) => o.tenantId === ctx.tenantId && (o.idempotencyKey === op.idempotencyKey || o.operationId === op.operationId));
      if (existingOp) { results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" }); continue; }
      try {
        if (op.entityType === "Product" && op.operationType === "CREATE") this.productRepo.createProduct(ctx, { ...(op.payload as unknown as CreateProductRequest), id: op.entityId });
        else if (op.entityType === "Product" && op.operationType === "UPDATE") this.productRepo.updateProduct(ctx, op.entityId, op.payload as any);
        else if (op.entityType === "ProductVariant" && op.operationType === "CREATE") { const payload = op.payload as unknown as CreateVariantRequest & { productId: string }; this.productRepo.addVariant(ctx, payload.productId, { ...payload, id: op.entityId }); }
        else if (op.entityType === "ProductVariant" && op.operationType === "UPDATE") this.productRepo.updateVariant(ctx, op.entityId, op.payload as any);
        else if (op.entityType === "ProductVariant" && op.operationType === "DELETE") this.productRepo.deleteVariant(ctx, op.entityId);
        else if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") this.stockRepo.recordStockAdjustment(ctx, { ...(op.payload as unknown as CreateStockAdjustmentRequest), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        const syncOp: SyncOperation = { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: req.deviceId, operationId: op.operationId, entityType: op.entityType, entityId: op.entityId, operationType: op.operationType, payload: op.payload, status: "PROCESSED", idempotencyKey: op.idempotencyKey, clientCreatedAt: op.clientCreatedAt, processedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
        this.store.syncOperations.set(syncOp.id, syncOp); processedCount += 1; results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
      } catch (err: any) { results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: err?.message || "Sync operation failed" }); }
    }
    return { processedCount, results };
  }

  processDelta(ctx: TenantContext, req: SyncDeltaRequest): SyncDeltaResponse {
    const sinceDate = req.since ? new Date(req.since) : new Date(0);
    return { serverTimestamp: new Date().toISOString(), products: this.productRepo.getProducts(ctx).filter((p) => new Date(p.updatedAt) >= sinceDate), variants: Array.from(this.store.variants.values()).filter((v) => v.tenantId === ctx.tenantId && v.branchId === ctx.branchId && new Date(v.updatedAt) >= sinceDate), stockLedger: this.stockRepo.getLedger(ctx).filter((l) => new Date(l.createdAt) >= sinceDate), adjustments: Array.from(this.store.stockAdjustments.values()).filter((a) => a.tenantId === ctx.tenantId && a.branchId === ctx.branchId && new Date(a.updatedAt) >= sinceDate) };
  }
}

export { PrismaSyncEngine } from "./prismaSyncEngine.js";
