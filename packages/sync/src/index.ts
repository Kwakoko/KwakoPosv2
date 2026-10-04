import type {
  TenantContext,
  SyncPushRequest,
  SyncPushResponse,
  SyncDeltaRequest,
  SyncDeltaResponse,
  SyncBootstrapRequest,
  SyncBootstrapResponse,
  SyncStateManifest,
  SyncReconciliationResponse,
  SyncReconciliationDiscrepancy,
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
  validateSyncEpoch,
  checkRollbackBarrier,
  computePayloadChecksum,
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

    // 1. Rollback Barrier Check: Freeze mutations during rollback
    const isBarrierActive = Boolean(
      this.store.rollbackSyncBarriers?.has(ctx.tenantId) ||
      (ctx.branchId && this.store.rollbackSyncBarriers?.has(`${ctx.tenantId}:${ctx.branchId}`))
    );
    checkRollbackBarrier(isBarrierActive);

    // 2. Stale Device Replay Protection: Validate sync epoch
    const currentEpoch = (ctx.branchId ? this.store.syncEpochs?.get(`${ctx.tenantId}:${ctx.branchId}`) : undefined) ||
      this.store.syncEpochs?.get(ctx.tenantId) || 1000;
    const clientEpoch = (req as any).syncEpoch;
    validateSyncEpoch(clientEpoch, currentEpoch);

    const results: SyncPushResponse["results"] = [];
    let processedCount = 0;
    const orderedOperations = orderSyncOperations(req.operations);

    for (const op of orderedOperations) {
      const existingOp = Array.from(this.store.syncOperations.values()).find(
        (o) =>
          o.tenantId === ctx.tenantId &&
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
        if (["Role", "User", "Employee", "PlatformSecurity", "SuperAdmin"].includes(op.entityType) || JSON.stringify(op.payload || {}).includes("SUPER_ADMIN")) {
          throw new Error("PRIVILEGE_ESCALATION_ATTEMPT_DENIED: privileged identity and HR entities cannot be mutated via sync payloads.");
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
        } else if ((op.entityType === "StockMovement" || op.entityType === "StockLedger") && op.operationType === "CREATE") {
          this.stockRepo.recordMovement(ctx, {
            ...(op.payload as any),
            id: op.entityId,
            deviceId: req.deviceId,
            operationId: op.operationId,
            idempotencyKey: op.idempotencyKey,
          });
        } else if (op.entityType === "Category" && (op.operationType === "CREATE" || op.operationType === "UPDATE")) {
          const categoriesMap = (this.store as any).categories || new Map();
          categoriesMap.set(`${ctx.tenantId}:${op.entityId}`, { id: op.entityId, tenantId: ctx.tenantId, ...op.payload, updatedAt: new Date().toISOString() });
          (this.store as any).categories = categoriesMap;
        } else if (op.entityType === "Brand" && (op.operationType === "CREATE" || op.operationType === "UPDATE")) {
          const brandsMap = (this.store as any).brands || new Map();
          brandsMap.set(`${ctx.tenantId}:${op.entityId}`, { id: op.entityId, tenantId: ctx.tenantId, ...op.payload, updatedAt: new Date().toISOString() });
          (this.store as any).brands = brandsMap;
        } else if (op.entityType === "Expense" && op.operationType === "CREATE") {
          const expensesMap = (this.store as any).expenses || new Map();
          expensesMap.set(op.entityId, { id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId, ...op.payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          (this.store as any).expenses = expensesMap;
        } else if (op.entityType === "Setting" && (op.operationType === "CREATE" || op.operationType === "UPDATE")) {
          const settingsMap = (this.store as any).settings || new Map();
          settingsMap.set(`${ctx.tenantId}:${op.entityId}`, { id: op.entityId, tenantId: ctx.tenantId, ...op.payload, updatedAt: new Date().toISOString() });
          (this.store as any).settings = settingsMap;
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
        } else if (op.entityType === "UnitConversionTransaction" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          const parentVar = this.store.variants.get(payload.parentVariantId);
          const childVar = this.store.variants.get(payload.childVariantId);
          if (!parentVar || !childVar) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
          const parentQty = Number((parentVar as any).inventoryQuantity ?? parentVar.stock ?? 0);
          const deduct = Number(payload.parentUnitsDeducted);
          const produce = Number(payload.childUnitsProduced);
          if (parentQty < deduct) {
            throw new Error(`CONVERSION_CONFLICT: INSUFFICIENT_PARENT_STOCK (Available: ${parentQty}, Required: ${deduct})`);
          }
          const nextParent = parentQty - deduct;
          const nextChild = Number((childVar as any).inventoryQuantity ?? childVar.stock ?? 0) + produce;
          (parentVar as any).inventoryQuantity = nextParent;
          parentVar.stock = nextParent;
          (childVar as any).inventoryQuantity = nextChild;
          childVar.stock = nextChild;
          this.store.variants.set(parentVar.id, parentVar);
          this.store.variants.set(childVar.id, childVar);
          this.stockRepo.recordMovement(ctx, {
            id: randomUUID(),
            productId: parentVar.productId,
            variantId: parentVar.id,
            movementType: "ADJUSTMENT",
            quantityChange: -deduct,
            notes: `Unit Conversion to ${childVar.name}`,
            deviceId: req.deviceId,
            operationId: op.operationId,
            idempotencyKey: `${op.idempotencyKey}-PARENT`,
          });
          this.stockRepo.recordMovement(ctx, {
            id: randomUUID(),
            productId: childVar.productId,
            variantId: childVar.id,
            movementType: "ADJUSTMENT",
            quantityChange: produce,
            notes: `Unit Conversion from ${parentVar.name}`,
            deviceId: req.deviceId,
            operationId: op.operationId,
            idempotencyKey: `${op.idempotencyKey}-CHILD`,
          });
          this.productRepo.recalculateProductStock(ctx, parentVar.productId);
          if (childVar.productId !== parentVar.productId) {
            this.productRepo.recalculateProductStock(ctx, childVar.productId);
          }
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
    if (!ctx?.tenantId || !ctx?.branchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED: authenticated tenant and branch are required");
    const sinceDate = req.since ? new Date(req.since) : new Date(0);
    if (Number.isNaN(sinceDate.getTime())) throw new Error("SYNC_PROTOCOL_INVALID: invalid delta cursor");
    const anchor = new Date();
    const maxTime = anchor.getTime() + 5000;
    const products = this.productRepo.getProducts(ctx).filter((p) => {
      const t = new Date(p.updatedAt).getTime();
      return t >= sinceDate.getTime() && t <= maxTime;
    }).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id));
    const variants = Array.from(this.store.variants.values()).filter(
      (v) => v.tenantId === ctx.tenantId && v.branchId === ctx.branchId && new Date(v.updatedAt).getTime() >= sinceDate.getTime() && new Date(v.updatedAt).getTime() <= maxTime
    ).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id));
    const stockLedger = this.stockRepo.getLedger(ctx).filter((l) => new Date(l.createdAt).getTime() >= sinceDate.getTime() && new Date(l.createdAt).getTime() <= maxTime).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
    const adjustments = Array.from(this.store.stockAdjustments.values()).filter(
      (a) => a.tenantId === ctx.tenantId && a.branchId === ctx.branchId && new Date(a.updatedAt).getTime() >= sinceDate.getTime() && new Date(a.updatedAt).getTime() <= maxTime
    ).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id));
    const customers = this.commercialRepo.getCustomers(ctx).filter((c) => new Date(c.updatedAt).getTime() >= sinceDate.getTime() && new Date(c.updatedAt).getTime() <= maxTime).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id));
    const suppliers = this.commercialRepo.getSuppliers(ctx).filter((s) => new Date(s.updatedAt).getTime() >= sinceDate.getTime() && new Date(s.updatedAt).getTime() <= maxTime).sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id));

    const deltaData = { products, variants, stockLedger, adjustments, customers, suppliers };
    return {
      serverTimestamp: anchor.toISOString(),
      ...deltaData,
      integrityChecksum: computePayloadChecksum(deltaData),
    };
  }

  processBootstrap(ctx: TenantContext, req: SyncBootstrapRequest): SyncBootstrapResponse {
    if (!ctx?.tenantId || !ctx?.branchId) throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED: authenticated tenant and branch are required");
    const anchor = new Date().toISOString();
    const products = this.productRepo.getProducts(ctx);
    const variants = Array.from(this.store.variants.values()).filter(
      (v) => v.tenantId === ctx.tenantId && v.branchId === ctx.branchId
    );
    const stockLedger = this.stockRepo.getLedger(ctx);
    const adjustments = Array.from(this.store.stockAdjustments.values()).filter(
      (a) => a.tenantId === ctx.tenantId && (a.branchId === ctx.branchId)
    );
    const customers = this.commercialRepo.getCustomers(ctx);
    const suppliers = this.commercialRepo.getSuppliers(ctx);
    const categories = Array.from(((this.store as any).categories || new Map()).values()).filter((c: any) => c.tenantId === ctx.tenantId) as Record<string, unknown>[];
    const brands = Array.from(((this.store as any).brands || new Map()).values()).filter((b: any) => b.tenantId === ctx.tenantId) as Record<string, unknown>[];
    const settings = Array.from(((this.store as any).settings || new Map()).values()).filter((s: any) => s.tenantId === ctx.tenantId) as Record<string, unknown>[];

    const snapshotPayload = {
      products,
      variants,
      stockLedger,
      adjustments,
      customers,
      suppliers,
      categories,
      brands,
      settings,
    };
    const integrityChecksum = computePayloadChecksum(snapshotPayload);

    return {
      snapshotTimestamp: anchor,
      integrityChecksum,
      schemaVersion: req.schemaVersion || 4,
      entityCounts: {
        products: products.length,
        variants: variants.length,
        stockLedger: stockLedger.length,
        adjustments: adjustments.length,
        customers: customers.length,
        suppliers: suppliers.length,
        categories: categories.length,
        brands: brands.length,
        settings: settings.length,
      },
      products,
      variants,
      stockLedger,
      adjustments,
      customers,
      suppliers,
      categories,
      brands,
      settings,
    };
  }

  reconcileState(ctx: TenantContext, manifest: SyncStateManifest): SyncReconciliationResponse {
    const discrepancies: SyncReconciliationDiscrepancy[] = [];
    const serverProducts = this.productRepo.getProducts(ctx);
    const serverProductIds = new Set(serverProducts.map((p) => p.id));
    const clientProductIds = new Set(manifest.productIds || []);

    for (const serverId of serverProductIds) {
      if (!clientProductIds.has(serverId)) {
        discrepancies.push({
          entityType: "Product",
          entityId: serverId,
          kind: "MISSING_ON_CLIENT",
          remediation: "Client should pull delta or execute bootstrap.",
        });
      }
    }

    for (const clientId of clientProductIds) {
      if (!serverProductIds.has(clientId)) {
        discrepancies.push({
          entityType: "Product",
          entityId: clientId,
          kind: "EXTRA_ON_CLIENT",
          remediation: "Verify uncommitted outbox mutation or purge stale client record.",
        });
      }
    }

    const serverVariants = Array.from(this.store.variants.values()).filter(
      (v) => v.tenantId === ctx.tenantId && (v.branchId === ctx.branchId)
    );
    for (const v of serverVariants) {
      if (!serverProductIds.has(v.productId)) {
        discrepancies.push({
          entityType: "ProductVariant",
          entityId: v.id,
          kind: "ORPHANED_VARIANT",
          remediation: "Re-associate variant with valid parent or archive variant.",
        });
      }
    }

    if (manifest.stockBalances) {
      for (const [variantId, clientQty] of Object.entries(manifest.stockBalances)) {
        const serverQty = this.stockRepo.getAvailableStock(ctx, variantId);
        if (serverQty !== clientQty) {
          discrepancies.push({
            entityType: "StockBalance",
            entityId: variantId,
            kind: "STOCK_MISMATCH",
            serverValue: serverQty,
            clientValue: clientQty,
            remediation: "Client must reconcile with authoritative ledger movements.",
          });
        }
      }
    }

    const serverCounts: Record<string, number> = {
      products: serverProducts.length,
      variants: serverVariants.length,
      stockLedger: this.stockRepo.getLedger(ctx).length,
    };

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      evaluatedAt: new Date().toISOString(),
      inSync: discrepancies.length === 0,
      totalDiscrepancies: discrepancies.length,
      discrepancies,
      serverCounts,
      integrityChecksum: computePayloadChecksum({ serverCounts, discrepancies }),
    };
  }
}

export { PrismaSyncEngine } from "./prismaSyncEngine.js";
export {
  WorldStandardPrismaSyncEngine,
  type JournalCompactionStats,
  type JournalCompactionOptions,
  type JournalCompactionResult,
  type CompactionScopeContext,
} from "./worldStandardPrismaSyncEngine.js";
export {
  checkRollbackBarrier,
  validateSyncEpoch,
  computePayloadChecksum,
  verifyPayloadChecksum,
  syncDependencyRank,
  orderSyncOperations,
} from "./syncIntegrity.js";
export { SyncConflictLogger, globalSyncConflictLogger } from "./syncConflictLogger.js";
export * from "./gates/shaResolution.js";
