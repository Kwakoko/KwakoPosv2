import type { TenantContext, SyncPushRequest, SyncPushResponse, SyncDeltaRequest, SyncDeltaResponse } from "@kwakopos2/contracts";
import { PrismaProductRepository, PrismaStockRepository, PrismaAtomicCommercialFinanceService } from "@kwakopos2/database";
import { prisma } from "@kwakopos2/database";
import { getBaseUpdatedAt, operationFingerprint, orderSyncOperations, stripSyncControlFields, validateSyncRequest } from "./syncIntegrity.js";

export class PrismaSyncEngine {
  private readonly atomicCommercialFinance: PrismaAtomicCommercialFinanceService;

  constructor(private readonly productRepo: PrismaProductRepository, private readonly stockRepo: PrismaStockRepository) {
    this.atomicCommercialFinance = new PrismaAtomicCommercialFinanceService(prisma);
  }

  async processPush(ctx: TenantContext, req: SyncPushRequest): Promise<SyncPushResponse> {
    validateSyncRequest(req);
    const results: SyncPushResponse["results"] = [];
    let processedCount = 0;
    const orderedOperations = orderSyncOperations(req.operations);

    for (const op of orderedOperations) {
      try {
        const existing = await prisma.syncOperation.findFirst({
          where: {
            tenantId: ctx.tenantId,
            deviceId: req.deviceId,
            OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }],
          },
        });
        if (existing) {
          const existingFingerprint = operationFingerprint({
            operationId: existing.operationId,
            entityType: existing.entityType as any,
            entityId: existing.entityId,
            operationType: existing.operationType as any,
            payload: existing.payload as any,
            clientCreatedAt: existing.clientCreatedAt.toISOString(),
            idempotencyKey: existing.idempotencyKey,
          });
          if (existingFingerprint !== operationFingerprint(op)) {
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: "SYNC_IDEMPOTENCY_CONFLICT: operation identity already exists with different content" });
          } else {
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
          }
          continue;
        }

        if (op.entityType === "Product" && op.operationType === "CREATE") {
          const existingProduct = await prisma.product.findUnique({ where: { id: op.entityId } });
          if (existingProduct) {
            if (existingProduct.tenantId !== ctx.tenantId || existingProduct.branchId !== ctx.branchId) throw new Error("Product entity belongs to another tenant or branch");
            await recordSyncOperation(ctx, req, op);
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
            continue;
          }
          await this.productRepo.createProduct(ctx, { ...(op.payload as any), id: op.entityId });
        } else if (op.entityType === "Product" && op.operationType === "UPDATE") {
          const existingProduct = await this.productRepo.getProductById(ctx, op.entityId);
          const baseUpdatedAt = getBaseUpdatedAt(op.payload);
          if (!existingProduct) throw new Error(`Product ${op.entityId} not found`);
          if (baseUpdatedAt && new Date(existingProduct.updatedAt).getTime() > new Date(baseUpdatedAt).getTime()) throw new Error("STALE_WRITE_CONFLICT: product changed on server after local edit began");
          await this.productRepo.updateProduct(ctx, op.entityId, stripSyncControlFields(op.payload as any));
        } else if (op.entityType === "ProductVariant" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          const existingVariant = await prisma.productVariant.findUnique({ where: { id: op.entityId } });
          if (existingVariant) {
            if (existingVariant.tenantId !== ctx.tenantId || existingVariant.branchId !== ctx.branchId) throw new Error("Variant entity belongs to another tenant or branch");
            await recordSyncOperation(ctx, req, op);
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
            continue;
          }
          await this.productRepo.addVariant(ctx, payload.productId, { ...payload, id: op.entityId });
        } else if (op.entityType === "ProductVariant" && op.operationType === "UPDATE") {
          const existingVariant = await prisma.productVariant.findUnique({ where: { id: op.entityId } });
          const baseUpdatedAt = getBaseUpdatedAt(op.payload);
          if (!existingVariant) throw new Error(`Variant ${op.entityId} not found`);
          if (existingVariant.tenantId !== ctx.tenantId || existingVariant.branchId !== ctx.branchId) throw new Error("Variant entity belongs to another tenant or branch");
          if (baseUpdatedAt && existingVariant.updatedAt.getTime() > new Date(baseUpdatedAt).getTime()) throw new Error("STALE_WRITE_CONFLICT: variant changed on server after local edit began");
          await this.productRepo.updateVariant(ctx, op.entityId, stripSyncControlFields(op.payload as any));
        } else if (op.entityType === "ProductVariant" && op.operationType === "DELETE") {
          const existingVariant = await prisma.productVariant.findUnique({ where: { id: op.entityId } });
          const baseUpdatedAt = getBaseUpdatedAt(op.payload);
          if (existingVariant) {
            if (existingVariant.tenantId !== ctx.tenantId || existingVariant.branchId !== ctx.branchId) throw new Error("Variant entity belongs to another tenant or branch");
            if (baseUpdatedAt && existingVariant.updatedAt.getTime() > new Date(baseUpdatedAt).getTime()) throw new Error("STALE_WRITE_CONFLICT: variant changed on server after local delete began");
            await prisma.productVariant.update({ where: { id: op.entityId }, data: { isActive: false } });
          }
        } else if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") {
          await this.stockRepo.recordStockAdjustment(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "Sale" && op.operationType === "CREATE") {
          await this.atomicCommercialFinance.createSale(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "PurchaseReceipt" && op.operationType === "CREATE") {
          await this.atomicCommercialFinance.createPurchaseReceipt(ctx, { ...(op.payload as any), id: op.entityId, deviceId: req.deviceId, operationId: op.operationId, idempotencyKey: op.idempotencyKey });
        } else if (op.entityType === "Customer" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          const existingCustomer = await prisma.customer.findUnique({ where: { id: op.entityId } });
          if (existingCustomer) {
            if (existingCustomer.tenantId !== ctx.tenantId || existingCustomer.branchId !== ctx.branchId) throw new Error("Customer entity belongs to another tenant or branch");
          } else {
            await prisma.customer.create({ data: { ...payload, id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
          }
        } else if (op.entityType === "Supplier" && op.operationType === "CREATE") {
          const payload = op.payload as any;
          const existingSupplier = await prisma.supplier.findUnique({ where: { id: op.entityId } });
          if (existingSupplier) {
            if (existingSupplier.tenantId !== ctx.tenantId || existingSupplier.branchId !== ctx.branchId) throw new Error("Supplier entity belongs to another tenant or branch");
          } else {
            await prisma.supplier.create({ data: { ...payload, id: op.entityId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
          }
        } else {
          throw new Error(`Unsupported sync operation: ${op.entityType}/${op.operationType}`);
        }

        await recordSyncOperation(ctx, req, op);
        processedCount += 1;
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "SUCCESS" });
      } catch (err: any) {
        if (err?.code === "P2002" || err?.code === "23505") {
          const committed = await prisma.syncOperation.findFirst({ where: { tenantId: ctx.tenantId, deviceId: req.deviceId, OR: [{ idempotencyKey: op.idempotencyKey }, { operationId: op.operationId }] } });
          if (committed) {
            results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "ALREADY_PROCESSED" });
            continue;
          }
        }
        results.push({ operationId: op.operationId, idempotencyKey: op.idempotencyKey, status: "FAILED", error: err?.message || "Sync operation failed" });
      }
    }
    return { processedCount, results };
  }

  async processDelta(ctx: TenantContext, req: SyncDeltaRequest): Promise<SyncDeltaResponse> {
    const since = req.since ? new Date(req.since) : new Date(0);
    if (Number.isNaN(since.getTime())) throw new Error("SYNC_PROTOCOL_INVALID: invalid delta cursor");
    const anchor = new Date();
    const products = (await this.productRepo.getProducts(ctx)).filter((p: any) => { const t = new Date(p.updatedAt).getTime(); return t >= since.getTime() && t <= anchor.getTime(); }).sort((a: any, b: any) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || a.id.localeCompare(b.id));
    const variants = await prisma.productVariant.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
    const ledger = (await this.stockRepo.getLedger(ctx)).filter((entry: any) => { const t = new Date(entry.createdAt).getTime(); return t >= since.getTime() && t <= anchor.getTime(); }).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
    const adjustments = await prisma.stockAdjustment.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
    const customers = await prisma.customer.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
    const suppliers = await prisma.supplier.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, updatedAt: { gte: since, lte: anchor } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
    return {
      serverTimestamp: anchor.toISOString(),
      products,
      variants: variants.map((v: any) => ({ id: v.id, tenantId: v.tenantId, branchId: v.branchId, productId: v.productId, name: v.name, sku: v.sku, barcode: v.barcode ?? null, price: Number(v.price), costPrice: Number(v.costPrice), isActive: v.isActive, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() })) as any,
      stockLedger: ledger,
      adjustments: adjustments.map((a: any) => ({ id: a.id, tenantId: a.tenantId, branchId: a.branchId, variantId: a.variantId, adjustmentType: a.adjustmentType, quantityChange: Number(a.quantityChange), reason: a.reason, referenceNote: a.referenceNote ?? null, status: a.status, createdByUserId: a.createdByUserId, deviceId: a.deviceId, operationId: a.operationId, idempotencyKey: a.idempotencyKey, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })),
      customers: customers.map((c: any) => ({ ...c, creditLimit: Number(c.creditLimit), currentBalance: Number(c.currentBalance), openingBalance: Number(c.openingBalance), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
      suppliers: suppliers.map((s: any) => ({ ...s, outstandingBalance: Number(s.outstandingBalance), createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })),
    };
  }
}

async function recordSyncOperation(ctx: TenantContext, req: SyncPushRequest, op: SyncPushRequest["operations"][number]): Promise<void> {
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
}
