import { PrismaClient } from "@prisma/client";
import {
  TenantContext,
  Product,
  ProductVariant,
  StockLedger,
  StockAdjustment,
  SyncOperation,
  CreateProductRequest,
  CreateVariantRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  CreateStockAdjustmentRequest,
} from "@kwakopos2/contracts";
import {
  calculateAvailableStock,
  assertProductVariantImmutability,
  assertVariantIdentityPersistence,
  assertTenantIsolation,
  assertLedgerRequiredForStockMutation,
  assertAdjustmentAuditable,
} from "@kwakopos2/domain";
import { randomUUID } from "crypto";

export const prisma = new PrismaClient();

// ============================================================
// In-Memory Database Store (For Unit/Sync Testing without DB)
// ============================================================

export class InMemoryStore {
  tenants: Map<string, any> = new Map();
  branches: Map<string, any> = new Map();
  users: Map<string, any> = new Map();
  roles: Map<string, any> = new Map();
  products: Map<string, Product> = new Map();
  variants: Map<string, ProductVariant> = new Map();
  stockLedgers: Map<string, StockLedger> = new Map();
  stockAdjustments: Map<string, StockAdjustment> = new Map();
  syncOperations: Map<string, SyncOperation> = new Map();
  auditEvents: Map<string, any> = new Map();

  clear() {
    this.tenants.clear();
    this.branches.clear();
    this.users.clear();
    this.roles.clear();
    this.products.clear();
    this.variants.clear();
    this.stockLedgers.clear();
    this.stockAdjustments.clear();
    this.syncOperations.clear();
    this.auditEvents.clear();
  }
}

export const globalInMemoryStore = new InMemoryStore();

// ============================================================
// Scoped Domain Repositories (Server Authoritative Core)
// ============================================================

export class ScopedProductRepository {
  constructor(private store: InMemoryStore = globalInMemoryStore) {}

  createProduct(ctx: TenantContext, req: CreateProductRequest): Product {
    const productId = req.id || randomUUID();
    const now = new Date().toISOString();

    const createdVariants: ProductVariant[] = (req.variants || []).map((v) => ({
      id: v.id || randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId,
      name: v.name,
      sku: v.sku,
      barcode: v.barcode || null,
      price: v.price,
      costPrice: v.costPrice,
      isActive: v.isActive !== undefined ? v.isActive : true,
      createdAt: now,
      updatedAt: now,
    }));

    const product: Product = {
      id: productId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: req.name,
      description: req.description || null,
      sku: req.sku,
      category: req.category || "General",
      isActive: true,
      variants: createdVariants,
      createdAt: now,
      updatedAt: now,
    };

    this.store.products.set(productId, product);
    for (const variant of createdVariants) {
      this.store.variants.set(variant.id, variant);
    }

    return product;
  }

  getProductById(ctx: TenantContext, id: string): Product | null {
    const product = this.store.products.get(id);
    if (!product) return null;
    assertTenantIsolation(ctx, product.tenantId, product.branchId);
    const variants = Array.from(this.store.variants.values()).filter(
      (v) => v.productId === id && v.tenantId === ctx.tenantId && v.branchId === ctx.branchId
    );
    return { ...product, variants };
  }

  getProducts(ctx: TenantContext): Product[] {
    return Array.from(this.store.products.values())
      .filter((p) => p.tenantId === ctx.tenantId && p.branchId === ctx.branchId)
      .map((p) => {
        const variants = Array.from(this.store.variants.values()).filter(
          (v) => v.productId === p.id && v.tenantId === ctx.tenantId && v.branchId === ctx.branchId
        );
        return { ...p, variants };
      });
  }

  updateProduct(ctx: TenantContext, id: string, req: UpdateProductRequest): Product {
    const existing = this.getProductById(ctx, id);
    if (!existing) throw new Error(`Product ${id} not found`);

    // INVARIANT 001 Check: Existing variants must not be implicitly wiped out
    const existingVariants = existing.variants || [];
    const retainedVariantIds = existingVariants.map((v) => v.id);
    assertProductVariantImmutability(existingVariants, retainedVariantIds);

    const updated: Product = {
      ...existing,
      name: req.name ?? existing.name,
      description: req.description !== undefined ? req.description : existing.description,
      sku: req.sku ?? existing.sku,
      category: req.category ?? existing.category,
      isActive: req.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    this.store.products.set(id, updated);
    return updated;
  }

  addVariant(ctx: TenantContext, productId: string, req: CreateVariantRequest): ProductVariant {
    const product = this.getProductById(ctx, productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    const variantId = req.id || randomUUID();
    const now = new Date().toISOString();

    const variant: ProductVariant = {
      id: variantId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId,
      name: req.name,
      sku: req.sku,
      barcode: req.barcode || null,
      price: req.price,
      costPrice: req.costPrice,
      isActive: req.isActive !== undefined ? req.isActive : true,
      createdAt: now,
      updatedAt: now,
    };

    this.store.variants.set(variantId, variant);
    return variant;
  }

  updateVariant(ctx: TenantContext, variantId: string, req: UpdateVariantRequest): ProductVariant {
    const existing = this.store.variants.get(variantId);
    if (!existing) throw new Error(`Variant ${variantId} not found`);
    assertTenantIsolation(ctx, existing.tenantId, existing.branchId);

    // INVARIANT 002 Check: Variant identity survives updates
    assertVariantIdentityPersistence(existing.id, variantId);

    const updated: ProductVariant = {
      ...existing,
      name: req.name ?? existing.name,
      sku: req.sku ?? existing.sku,
      barcode: req.barcode !== undefined ? req.barcode : existing.barcode,
      price: req.price ?? existing.price,
      costPrice: req.costPrice ?? existing.costPrice,
      isActive: req.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    this.store.variants.set(variantId, updated);
    return updated;
  }

  deleteVariant(ctx: TenantContext, variantId: string): boolean {
    const existing = this.store.variants.get(variantId);
    if (!existing) return false;
    assertTenantIsolation(ctx, existing.tenantId, existing.branchId);

    this.store.variants.delete(variantId);
    return true;
  }
}

export class ScopedStockRepository {
  constructor(private store: InMemoryStore = globalInMemoryStore) {}

  recordStockAdjustment(ctx: TenantContext, req: CreateStockAdjustmentRequest): {
    adjustment: StockAdjustment;
    ledger: StockLedger;
  } {
    // Check Idempotency Key
    const existingAdjustment = Array.from(this.store.stockAdjustments.values()).find(
      (a) => a.tenantId === ctx.tenantId && a.idempotencyKey === req.idempotencyKey
    );
    if (existingAdjustment) {
      const existingLedger = Array.from(this.store.stockLedgers.values()).find(
        (l) => l.tenantId === ctx.tenantId && l.idempotencyKey === req.idempotencyKey
      )!;
      return { adjustment: existingAdjustment, ledger: existingLedger };
    }

    const variant = this.store.variants.get(req.variantId);
    if (!variant) throw new Error(`Variant ${req.variantId} not found`);
    assertTenantIsolation(ctx, variant.tenantId, variant.branchId);

    const now = new Date().toISOString();
    const adjustmentId = req.id || randomUUID();

    let changeQty = req.quantityChange;
    if (req.adjustmentType === "DECREASE") {
      changeQty = -Math.abs(req.quantityChange);
    } else if (req.adjustmentType === "SET") {
      const currentStock = this.getAvailableStock(ctx, req.variantId);
      changeQty = req.quantityChange - currentStock;
    }

    const adjustment: StockAdjustment = {
      id: adjustmentId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      variantId: req.variantId,
      adjustmentType: req.adjustmentType,
      quantityChange: changeQty,
      reason: req.reason,
      referenceNote: req.referenceNote || null,
      status: "COMPLETED",
      createdByUserId: ctx.userId,
      deviceId: req.deviceId,
      operationId: req.operationId,
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    assertAdjustmentAuditable(adjustment);

    // INVARIANT 003 Check: Stock mutation requires StockLedger movement
    assertLedgerRequiredForStockMutation("ADJUSTMENT", changeQty);

    const ledger: StockLedger = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId: variant.productId,
      variantId: req.variantId,
      movementType: "ADJUSTMENT",
      quantity: changeQty,
      referenceType: "StockAdjustment",
      referenceId: adjustmentId,
      occurredAt: now,
      deviceId: req.deviceId,
      operationId: req.operationId,
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
    };

    this.store.stockAdjustments.set(adjustmentId, adjustment);
    this.store.stockLedgers.set(ledger.id, ledger);

    return { adjustment, ledger };
  }

  getAvailableStock(ctx: TenantContext, variantId: string): number {
    const ledgerEntries = Array.from(this.store.stockLedgers.values()).filter(
      (l) => l.tenantId === ctx.tenantId && l.branchId === ctx.branchId && l.variantId === variantId
    );
    return calculateAvailableStock(ledgerEntries);
  }

  getLedger(ctx: TenantContext, variantId?: string): StockLedger[] {
    return Array.from(this.store.stockLedgers.values()).filter(
      (l) =>
        l.tenantId === ctx.tenantId &&
        l.branchId === ctx.branchId &&
        (!variantId || l.variantId === variantId)
    );
  }
}
