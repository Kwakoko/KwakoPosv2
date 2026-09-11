import { randomUUID } from "crypto";
import type {
  TenantContext,
  StockBatch,
  CreateBatchRequest,
  FefoPickRequest,
  FefoPickResult,
  FefoAllocation,
  BatchExpiryAlert,
} from "@kwakopos2/contracts";

export class InventoryBatchEngine {
  private static instance: InventoryBatchEngine | null = null;
  private batches = new Map<string, StockBatch>();

  public static getInstance(): InventoryBatchEngine {
    if (!InventoryBatchEngine.instance) {
      InventoryBatchEngine.instance = new InventoryBatchEngine();
    }
    return InventoryBatchEngine.instance;
  }

  public static resetInstance(): void {
    InventoryBatchEngine.instance = new InventoryBatchEngine();
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access batches of tenant '${tenantId}'.`
      );
    }
  }

  /**
   * Register a new inventory stock batch
   */
  public registerBatch(ctx: TenantContext, req: CreateBatchRequest): StockBatch {
    const now = new Date().toISOString();
    const expiry = new Date(req.expiryDate).toISOString();

    if (expiry <= now) {
      throw new Error("INVALID_BATCH_EXPIRY: Cannot register a batch that is already expired.");
    }

    const batch: StockBatch = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId: req.productId,
      variantId: req.variantId,
      batchNumber: req.batchNumber.trim().toUpperCase(),
      manufacturingDate: req.manufacturingDate,
      expiryDate: expiry,
      quantityReceived: req.quantity,
      quantityRemaining: req.quantity,
      unitCost: req.unitCost,
      status: "ACTIVE",
      supplierId: req.supplierId,
      notes: req.notes,
      createdAt: now,
      updatedAt: now,
    };

    this.batches.set(batch.id, batch);
    return { ...batch };
  }

  /**
   * Get all active batches for a given variant, sorted by earliest expiry date first (FEFO order)
   */
  public getActiveBatchesFefo(ctx: TenantContext, variantId: string): StockBatch[] {
    this.assertIsolation(ctx, ctx.tenantId);
    const now = new Date().toISOString();

    const candidateBatches = Array.from(this.batches.values()).filter(
      (b) =>
        b.tenantId === ctx.tenantId &&
        b.branchId === ctx.branchId &&
        b.variantId === variantId &&
        b.status === "ACTIVE" &&
        b.quantityRemaining > 0
    );

    // Auto-expire batches that passed expiry date
    for (const b of candidateBatches) {
      if (b.expiryDate < now) {
        b.status = "EXPIRED";
        b.updatedAt = now;
      }
    }

    return candidateBatches
      .filter((b) => b.status === "ACTIVE")
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }

  /**
   * Execute First-Expired-First-Out (FEFO) stock allocation
   */
  public allocateFefo(ctx: TenantContext, req: FefoPickRequest): FefoPickResult {
    this.assertIsolation(ctx, ctx.tenantId);

    const availableBatches = this.getActiveBatchesFefo(ctx, req.variantId);
    let needed = req.quantityRequested;
    const allocations: FefoAllocation[] = [];
    const now = new Date().toISOString();

    for (const batch of availableBatches) {
      if (needed <= 0) break;

      const allocateQty = Math.min(batch.quantityRemaining, needed);
      batch.quantityRemaining -= allocateQty;
      needed -= allocateQty;

      if (batch.quantityRemaining === 0) {
        batch.status = "DEPLETED";
      }
      batch.updatedAt = now;

      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        allocatedQuantity: allocateQty,
        unitCost: batch.unitCost,
      });
    }

    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedQuantity, 0);

    return {
      variantId: req.variantId,
      quantityRequested: req.quantityRequested,
      totalAllocated,
      unfulfilledQuantity: Math.max(0, req.quantityRequested - totalAllocated),
      allocations,
      isFullyFulfilled: totalAllocated >= req.quantityRequested,
    };
  }

  /**
   * Query expiring or expired batches for alert reporting
   */
  public getExpiringAlerts(
    ctx: TenantContext,
    options: { thresholdDays?: number; variantId?: string } = {}
  ): BatchExpiryAlert[] {
    this.assertIsolation(ctx, ctx.tenantId);
    const thresholdDays = options.thresholdDays ?? 30;
    const now = new Date();
    const alerts: BatchExpiryAlert[] = [];

    for (const batch of this.batches.values()) {
      if (batch.tenantId !== ctx.tenantId || batch.branchId !== ctx.branchId) continue;
      if (options.variantId && batch.variantId !== options.variantId) continue;
      if (batch.quantityRemaining <= 0) continue;

      const expiry = new Date(batch.expiryDate);
      const diffMs = expiry.getTime() - now.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 0) {
        alerts.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          variantId: batch.variantId,
          expiryDate: batch.expiryDate,
          daysUntilExpiry,
          quantityRemaining: batch.quantityRemaining,
          riskLevel: "EXPIRED",
        });
      } else if (daysUntilExpiry <= thresholdDays) {
        alerts.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          variantId: batch.variantId,
          expiryDate: batch.expiryDate,
          daysUntilExpiry,
          quantityRemaining: batch.quantityRemaining,
          riskLevel: "EXPIRING_SOON",
        });
      }
    }

    return alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  /**
   * Get batch by ID
   */
  public getBatchById(ctx: TenantContext, batchId: string): StockBatch | null {
    const batch = this.batches.get(batchId);
    if (!batch) return null;
    this.assertIsolation(ctx, batch.tenantId);
    return { ...batch };
  }
}

export const globalInventoryBatchEngine = InventoryBatchEngine.getInstance();
