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
  CreateCustomerRequest,
  CreateSupplierRequest,
  CreatePosSaleRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseReceiptRequest,
  CreatePaymentRequest,
  CreateSaleReturnRequest,
  OpenCashSessionRequest,
} from "@kwakopos2/contracts";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  globalInMemoryStore,
  globalCommercialRepository,
  InMemoryStore,
} from "@kwakopos2/database";
import { randomUUID } from "crypto";
import {
  getBaseUpdatedAt,
  operationFingerprint,
  orderSyncOperations,
  stripSyncControlFields,
  validateSyncRequest,
} from "./syncIntegrity.js";

export class SyncEngine {
  private productRepo: ScopedProductRepository;
  private stockRepo: ScopedStockRepository;
  private commercialRepo: ScopedCommercialRepository;
  private store: InMemoryStore;

  constructor(
    productRepo: ScopedProductRepository,
    stockRepo: ScopedStockRepository,
    commercialRepoOrStore?: ScopedCommercialRepository | InMemoryStore,
    store?: InMemoryStore
  ) {
    this.productRepo = productRepo;
    this.stockRepo = stockRepo;
    if (commercialRepoOrStore && ("tenants" in (commercialRepoOrStore as any) || "clear" in (commercialRepoOrStore as any))) {
      this.store = commercialRepoOrStore as InMemoryStore;
      this.commercialRepo = new ScopedCommercialRepository(this.store);
    } else {
      this.commercialRepo = (commercialRepoOrStore as ScopedCommercialRepository) || globalCommercialRepository;
      this.store = store || globalInMemoryStore;
    }
  }

  processPush(ctx: TenantContext, req: SyncPushRequest): SyncPushResponse {
    validateSyncRequest(req);
    const results: SyncPushResponse["results"] = [];
    let processedCount = 0;
    const orderedOperations = orderSyncOperations(req.operations);

    for (const op of orderedOperations) {
      const existingOp = Array.from(this.store.syncOperations.values()).find(
        (o) =>
          o.tenantId === ctx.tenantId &&
          o.deviceId === req.deviceId &&
          (o.idempotencyKey === op.idempotencyKey || o.operationId === op.operationId)
      );
      if (existingOp) {
        const existingFingerprint = operationFingerprint({
          operationId: existingOp.operationId,
          entityType: existingOp.entityType as any,
          entityId: existingOp.entityId,
          operationType: existingOp.operationType as any,
          payload: existingOp.payload as any,
          clientCreatedAt: typeof existingOp.clientCreatedAt === "string" ? existingOp.clientCreatedAt : new Date(existingOp.clientCreatedAt).toISOString(),
          idempotencyKey: existingOp.idempotencyKey,
        });
        if (existingFingerprint !== operationFingerprint(op)) {
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_IDEMPOTENCY_CONFLICT: operation identity already exists with different content" });
        } else {
          results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
        }
        continue;
      }

      try {
        if (["Role", "User", "PlatformSecurity", "SuperAdmin"].includes(op.entityType) || JSON.stringify(op.payload || {}).includes("SUPER_ADMIN")) {
          throw new Error("PRIVILEGE_ESCALATION_ATTEMPT_DENIED: Super Admin and Role entities cannot be mutated via sync payloads.");
        }

        if (op.entityType === "Product" && op.operationType === "CREATE") {
          const productPayload = op.payload as unknown as CreateProductRequest;
          const hasExplicitVariantCreate = orderedOperations.some((candidate) =>
            candidate.entityType === "ProductVariant" &&
            candidate.operationType === "CREATE" &&
            (candidate.payload as any)?.productId === op.entityId
          );
          this.productRepo.createProduct(ctx, {
            ...productPayload,
            id: op.entityId,
            hasVariants: Boolean(productPayload.hasVariants || productPayload.variants?.length || hasExplicitVariantCreate),
          });
        } else if (op.entityType === "Product" && op.operationType === "UPDATE") {
          const current = this.productRepo.getProductById(ctx, op.entityId);
          const baseUpdatedAt = getBaseUpdatedAt(op.payload);
          if (!current) throw new Error(`Product ${op.entityId} not found`);
          if (baseUpdatedAt && new Date(current.updatedAt).getTime() > new Date(baseUpdatedAt).getTime()) {
            throw new Error("STALE_WRITE_CONFLICT: product changed on server after local edit began");
          }
          this.productRepo.updateProduct(ctx, op.entityId, stripSyncControlFields(op.payload as any));
        } else if (op.entityType === "ProductVariant" && op.operationType === "CREATE") {
          const payload = op.payload as unknown as CreateVariantRequest & { productId: string };
          const createdVariant = this.productRepo.addVariant(ctx, payload.productId, { ...payload, id: op.entityId });
          for (const variant of Array.from(this.store.variants.values())) {
            if (
              variant.id !== createdVariant.id &&
              variant.productId === payload.productId &&
              variant.tenantId === ctx.tenantId &&
              variant.branchId === ctx.branchId &&
              ((variant.attributes as any)?.__systemDefaultVariant === true ||
                (variant.attributes as any)?.__systemDefaultVariant === "true")
            ) {
              this.store.variants.delete(variant.id);
            }
          }
          this.productRepo.recalculateProductStock(ctx, payload.productId);
        } else if (op.entityType === "ProductVariant" && op.operationType === "UPDATE") {
          const current = this.store.variants.get(op.entityId);
          const baseUpdatedAt = getBaseUpdatedAt(op.payload);
          if (!current) throw new Error(`Variant ${op.entityId} not found`);
          if (current.tenantId !== ctx.tenantId || current.branchId !== ctx.branchId) throw new Error("Variant entity belongs to another tenant or branch");
          if (baseUpdatedAt && new Date(current.updatedAt).getTime() > new Date(baseUpdatedAt).getTime()) {
            throw new Error("STALE_WRITE_CONFLICT: variant changed on server after local edit began");
          }
          this.productRepo.updateVariant(ctx, op.entityId, stripSyncControlFields(op.payload as any));
        } else if (op.entityType === "ProductVariant" && op.operationType === "DELETE") {
          const current = this.store.variants.get(op.entityId);
          const baseUpdatedAt = getBaseUpdatedAt(op.payload);
          if (current && baseUpdatedAt && new Date(current.updatedAt).getTime() > new Date(baseUpdatedAt).getTime()) {
            throw new Error("STALE_WRITE_CONFLICT: variant changed on server after local delete began");
          }
          this.productRepo.deleteVariant(ctx, op.entityId);
        } else if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") {
          this.stockRepo.recordStockAdjustment(ctx, {
            ...(op.payload as unknown as CreateStockAdjustmentRequest),
            id: op.entityId,
            deviceId: req.deviceId,
            operationId: op.operationId,
            idempotencyKey: op.idempotencyKey,
          });
        } else if (op.entityType === "Customer" && op.operationType === "CREATE") {
          this.commercialRepo.createCustomer(ctx, { ...(op.payload as unknown as CreateCustomerRequest), id: op.entityId });
        } else if (op.entityType === "Supplier" && op.operationType === "CREATE") {
          this.commercialRepo.createSupplier(ctx, { ...(op.payload as unknown as CreateSupplierRequest), id: op.entityId });
        } else if (op.entityType === "Sale" && op.operationType === "CREATE") {
          this.commercialRepo.createPosSale(ctx, { ...(op.payload as unknown as CreatePosSaleRequest), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "PurchaseOrder" && op.operationType === "CREATE") {
          this.commercialRepo.createPurchaseOrder(ctx, op.payload as unknown as CreatePurchaseOrderRequest);
        } else if (op.entityType === "PurchaseReceipt" && op.operationType === "CREATE") {
          this.commercialRepo.createPurchaseReceipt(ctx, { ...(op.payload as unknown as CreatePurchaseReceiptRequest), deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "Payment" && op.operationType === "CREATE") {
          const payload = op.payload as unknown as CreatePaymentRequest;
          void payload;
        } else if ((op.entityType === "SaleReturn" || op.entityType === "Return") && op.operationType === "CREATE") {
          this.commercialRepo.createSaleReturn(ctx, {
            ...(op.payload as unknown as CreateSaleReturnRequest),
            deviceId: req.deviceId,
            operationId: op.operationId,
            idempotencyKey: op.idempotencyKey,
          });
        } else if (op.entityType === "CashSession" && op.operationType === "CREATE") {
          this.commercialRepo.openCashSession(ctx, op.payload as unknown as OpenCashSessionRequest);
        } else if (op.entityType?.startsWith("Plugin:") || ["RestaurantTable", "KitchenTicket", "GarageVehicle", "GarageWorkOrder", "PharmacyPrescription", "TelecomSite"].includes(op.entityType)) {
          const pluginEntityMap = (this.store as any).pluginCustomEntities || new Map();
          pluginEntityMap.set(`${ctx.tenantId}:${op.entityType}:${op.entityId}`, {
            id: op.entityId,
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            entityType: op.entityType,
            payload: op.payload,
            updatedAt: new Date().toISOString(),
          });
          (this.store as any).pluginCustomEntities = pluginEntityMap;
        } else {
          throw new Error(`Unsupported sync operation: ${op.entityType}/${op.operationType}`);
        }

        const syncOp: SyncOperation = {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          deviceId: req.deviceId,
          operationId: op.operationId,
          entityType: op.entityType,
          entityId: op.entityId,
          operationType: op.operationType,
          payload: op.payload,
          status: "PROCESSED",
          idempotencyKey: op.idempotencyKey,
          clientCreatedAt: op.clientCreatedAt,
          processedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        this.store.syncOperations.set(syncOp.id, syncOp);
        processedCount += 1;
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
      } catch (err: any) {
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: err?.message || "Sync operation failed" });
      }
    }

    return { processedCount, results };
  }

  processDelta(ctx: TenantContext, req: SyncDeltaRequest): SyncDeltaResponse {
    const sinceDate = req.since ? new Date(req.since) : new Date(0);
    if (Number.isNaN(sinceDate.getTime())) throw new Error("SYNC_PROTOCOL_INVALID: invalid delta cursor");
    const anchor = new Date();
    return {
      serverTimestamp: anchor.toISOString(),
      products: this.productRepo.getProducts(ctx).filter((p) => {
        const t = new Date(p.updatedAt).getTime();
        return t >= sinceDate.getTime() && t <= anchor.getTime();
      }).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id)),
      variants: Array.from(this.store.variants.values()).filter(
        (v) => v.tenantId === ctx.tenantId && v.branchId === ctx.branchId && new Date(v.updatedAt).getTime() >= sinceDate.getTime() && new Date(v.updatedAt).getTime() <= anchor.getTime()
      ).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id)),
      stockLedger: this.stockRepo.getLedger(ctx).filter((l) => new Date(l.createdAt).getTime() >= sinceDate.getTime() && new Date(l.createdAt).getTime() <= anchor.getTime()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id)),
      adjustments: Array.from(this.store.stockAdjustments.values()).filter(
        (a) => a.tenantId === ctx.tenantId && a.branchId === ctx.branchId && new Date(a.updatedAt).getTime() >= sinceDate.getTime() && new Date(a.updatedAt).getTime() <= anchor.getTime()
      ).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id)),
      customers: this.commercialRepo.getCustomers(ctx).filter((c) => new Date(c.updatedAt).getTime() >= sinceDate.getTime() && new Date(c.updatedAt).getTime() <= anchor.getTime()).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id)),
      suppliers: this.commercialRepo.getSuppliers(ctx).filter((s) => new Date(s.updatedAt).getTime() >= sinceDate.getTime() && new Date(s.updatedAt).getTime() <= anchor.getTime()).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id)),
    };
  }
}

export { PrismaSyncEngine } from "./prismaSyncEngine.js";
