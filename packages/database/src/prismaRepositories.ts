import type {
  TenantContext,
  Product,
  ProductVariant,
  StockLedger,
  StockAdjustment,
  CreateProductRequest,
  CreateVariantRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  CreateStockAdjustmentRequest,
} from "@kwakopos2/contracts";
import { calculateAvailableStock, assertTenantIsolation } from "@kwakopos2/domain";
import { prisma } from "./index.js";

const productShape = (row: any): Product => {
  const buyingPrice = Number(row.buyingPrice ?? 0);
  const sellingPrice = Number(row.sellingPrice ?? 0);
  const marginAmount = Number(row.currentMarginAmount ?? (sellingPrice - buyingPrice));
  const marginPercentage = Number(row.currentMarginPercentage ?? (sellingPrice > 0 ? ((sellingPrice - buyingPrice) / sellingPrice) * 100 : 0));
  const variants = (row.variants || []).map((v: any) => variantShape(v, buyingPrice, sellingPrice));

  let totalStock = Number(row.totalStock ?? 0);
  let reservedStock = Number(row.reservedStock ?? 0);
  let availableStock = Number(row.availableStock ?? 0);
  let lowStockVariantsCount = Number(row.lowStockVariantsCount ?? 0);

  if (variants.length > 0) {
    totalStock = variants.reduce((acc: number, v: any) => acc + (v.stock || 0), 0);
    reservedStock = variants.reduce((acc: number, v: any) => acc + (v.reservedQuantity || 0), 0);
    availableStock = Math.max(0, totalStock - reservedStock);
    lowStockVariantsCount = variants.filter((v: any) => v.stock <= v.reorderLevel).length;
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    categoryId: row.categoryId ?? null,
    brandId: row.brandId ?? row.brand_id ?? null,
    brand_id: row.brandId ?? row.brand_id ?? null,
    supplierId: row.supplierId ?? null,
    taxId: row.taxId ?? null,
    name: row.name,
    description: row.description ?? null,
    sku: row.sku,
    category: row.category,
    buyingPrice,
    sellingPrice,
    currentMarginAmount: marginAmount,
    currentMarginPercentage: marginPercentage,
    images: Array.isArray(row.images) ? row.images : [],
    hasVariants: variants.length > 0 || (row.hasVariants ?? false),
    totalStock,
    reservedStock,
    availableStock,
    lowStockVariantsCount,
    isActive: row.isActive,
    variants,
    createdAt: row.createdAt ? (typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString()) : new Date().toISOString(),
    updatedAt: row.updatedAt ? (typeof row.updatedAt === "string" ? row.updatedAt : row.updatedAt.toISOString()) : new Date().toISOString(),
  };
};

const variantShape = (row: any, parentBuyingPrice: number = 0, parentSellingPrice: number = 0): ProductVariant => {
  const inheritBuying = row.inheritBuyingPrice ?? true;
  const inheritSelling = row.inheritSellingPrice ?? true;
  const costPrice = Number(row.costPrice ?? parentBuyingPrice);
  const price = Number(row.price ?? parentSellingPrice);
  const stock = Number(row.inventoryQuantity ?? row.stock ?? 0);
  const reserved = Number(row.reservedQuantity ?? 0);
  const effectiveBuyingPrice = inheritBuying ? parentBuyingPrice : costPrice;
  const effectiveSellingPrice = inheritSelling ? parentSellingPrice : price;
  const marginAmount = Number(row.currentMarginAmount ?? (effectiveSellingPrice - effectiveBuyingPrice));
  const marginPercentage = Number(row.currentMarginPercentage ?? (effectiveSellingPrice > 0 ? ((effectiveSellingPrice - effectiveBuyingPrice) / effectiveSellingPrice) * 100 : 0));

  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    productId: row.productId,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? null,
    inheritBuyingPrice: inheritBuying,
    inheritSellingPrice: inheritSelling,
    costPrice,
    price,
    effectiveBuyingPrice,
    effectiveSellingPrice,
    currentMarginAmount: marginAmount,
    currentMarginPercentage: marginPercentage,
    inventoryQuantity: stock,
    stock,
    reservedQuantity: reserved,
    availableStock: Math.max(0, stock - reserved),
    reorderLevel: Number(row.reorderLevel ?? 0),
    imageUrl: row.imageUrl ?? null,
    attributes: typeof row.attributes === "object" && row.attributes !== null ? row.attributes : {},
    isActive: row.isActive,
    createdAt: row.createdAt ? (typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString()) : new Date().toISOString(),
    updatedAt: row.updatedAt ? (typeof row.updatedAt === "string" ? row.updatedAt : row.updatedAt.toISOString()) : new Date().toISOString(),
  };
};

const ledgerShape = (row: any): StockLedger => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  productId: row.productId,
  variantId: row.variantId,
  movementType: row.movementType,
  quantityBefore: Number(row.quantityBefore ?? 0),
  quantityChange: Number(row.quantityChange ?? row.quantity ?? 0),
  quantity: Number(row.quantity),
  quantityAfter: Number(row.quantityAfter ?? 0),
  unitCost: Number(row.unitCost ?? 0),
  totalCost: Number(row.totalCost ?? 0),
  referenceType: row.referenceType,
  referenceId: row.referenceId ?? null,
  occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
  deviceId: row.deviceId || "SYS-01",
  operationId: row.operationId || "OP-01",
  idempotencyKey: row.idempotencyKey || `LED-${row.id}`,
  synced: row.synced ?? true,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
});

const adjustmentShape = (row: any): StockAdjustment => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  variantId: row.variantId,
  adjustmentType: row.adjustmentType,
  quantityChange: Number(row.quantityChange),
  reason: row.reason,
  referenceNote: row.referenceNote ?? null,
  status: row.status,
  createdByUserId: row.createdByUserId,
  deviceId: row.deviceId,
  operationId: row.operationId,
  idempotencyKey: row.idempotencyKey,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export class PrismaProductRepository {
  async createProduct(ctx: TenantContext, req: CreateProductRequest): Promise<Product> {
    const defaultVariant = {
      id: req.id ? `${req.id}-default` : undefined,
      name: "Standard",
      sku: `${req.sku}-STD`,
      barcode: null,
      price: req.sellingPrice || 0,
      costPrice: req.buyingPrice || 0,
      isActive: true,
    };
    const variantsToCreate = (req.variants && req.variants.length > 0)
      ? req.variants
      : [defaultVariant];

    const row = await prisma.product.create({
      data: {
        id: req.id,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        name: req.name,
        description: req.description ?? null,
        sku: req.sku,
        category: req.category ?? "General",
        isActive: true,
        buyingPrice: req.buyingPrice || 0,
        sellingPrice: req.sellingPrice || 0,
        hasVariants: Boolean(req.hasVariants),
        variants: {
          create: variantsToCreate.map((v: any) => ({
            id: v.id,
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            price: v.price,
            costPrice: v.costPrice,
            isActive: v.isActive ?? true,
          })),
        },
      },
      include: { variants: true },
    });
    return productShape(row);
  }

  async getProductById(ctx: TenantContext, id: string): Promise<Product | null> {
    const row = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
    if (!row) return null;
    assertTenantIsolation(ctx, row.tenantId, row.branchId);
    return productShape(row);
  }

  async getProducts(ctx: TenantContext): Promise<Product[]> {
    const rows = await prisma.product.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
      include: { variants: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(productShape);
  }

  async updateProduct(ctx: TenantContext, id: string, req: UpdateProductRequest): Promise<Product> {
    const existing = await this.getProductById(ctx, id);
    if (!existing) throw new Error(`Product ${id} not found`);
    const row = await prisma.product.update({
      where: { id },
      data: {
        name: req.name,
        description: req.description,
        sku: req.sku,
        category: req.category,
        isActive: req.isActive,
      },
      include: { variants: true },
    });
    return productShape(row);
  }

  async addVariant(ctx: TenantContext, productId: string, req: CreateVariantRequest): Promise<ProductVariant> {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error(`Product ${productId} not found`);
    assertTenantIsolation(ctx, product.tenantId, product.branchId);
    const row = await prisma.productVariant.create({
      data: {
        id: req.id,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId,
        name: req.name,
        sku: req.sku,
        barcode: req.barcode ?? null,
        price: req.price,
        costPrice: req.costPrice,
        isActive: req.isActive ?? true,
      },
    });
    return variantShape(row);
  }

  async updateVariant(ctx: TenantContext, id: string, req: UpdateVariantRequest): Promise<ProductVariant> {
    const existing = await prisma.productVariant.findUnique({ where: { id } });
    if (!existing) throw new Error(`Variant ${id} not found`);
    assertTenantIsolation(ctx, existing.tenantId, existing.branchId);
    const row = await prisma.productVariant.update({
      where: { id },
      data: {
        name: req.name,
        sku: req.sku,
        barcode: req.barcode,
        price: req.price,
        costPrice: req.costPrice,
        isActive: req.isActive,
      },
    });
    return variantShape(row);
  }

  async deleteVariant(ctx: TenantContext, id: string): Promise<boolean> {
    const existing = await prisma.productVariant.findUnique({ where: { id } });
    if (!existing) return false;
    assertTenantIsolation(ctx, existing.tenantId, existing.branchId);
    await prisma.productVariant.delete({ where: { id } });
    return true;
  }

  async recordPriceChange(ctx: TenantContext, req: any): Promise<any> {
    const productId = req.productId;
    const product = await this.getProductById(ctx, productId);
    if (!product) throw new Error(`Product ${productId} not found`);
    return {
      id: "ph-" + Date.now(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId,
      variantId: req.variantId ?? null,
      changeType: req.changeType,
      oldBuyingPrice: product.buyingPrice,
      newBuyingPrice: req.newBuyingPrice,
      oldSellingPrice: product.sellingPrice,
      newSellingPrice: req.newSellingPrice,
      currentMarginAmount: req.newSellingPrice - req.newBuyingPrice,
      currentMarginPercentage: req.newSellingPrice > 0 ? ((req.newSellingPrice - req.newBuyingPrice) / req.newSellingPrice) * 100 : 0,
      reason: req.reason,
      effectiveDate: new Date().toISOString(),
      changedByUserId: ctx.userId,
      versionNumber: 1,
      createdAt: new Date().toISOString(),
    };
  }

  async getPriceHistory(ctx: TenantContext, productId: string): Promise<any[]> {
    return [];
  }
}

export class PrismaStockRepository {
  async recordMovement(ctx: TenantContext, req: any): Promise<StockLedger> {
    const variant = await prisma.productVariant.findUnique({ where: { id: req.variantId } });
    if (!variant) throw new Error(`Variant ${req.variantId} not found`);
    const row = await prisma.stockLedger.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: variant.productId,
        variantId: req.variantId,
        movementType: req.movementType,
        quantityChange: req.quantityChange ?? req.quantity ?? 0,
        quantity: req.quantity,
        referenceType: req.referenceType,
        referenceId: req.referenceId ?? null,
        occurredAt: new Date(),
        deviceId: req.deviceId,
        operationId: req.operationId,
        idempotencyKey: req.idempotencyKey,
      },
    });
    return ledgerShape(row);
  }

  async getProductBranchStockCache(ctx: TenantContext, variantId: string): Promise<any | null> {
    const availableStock = await this.getAvailableStock(ctx, variantId);
    return {
      id: `${ctx.tenantId}-${ctx.branchId}-${variantId}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      variantId,
      availableStock,
      reservedStock: 0,
      totalStock: availableStock,
      averageCost: 0,
      stockValue: 0,
      lastMovementAt: new Date().toISOString(),
      lastRecalculatedAt: new Date().toISOString(),
    };
  }

  async recalculateStockCacheFromLedger(ctx: TenantContext, variantId: string): Promise<any> {
    const cache = await this.getProductBranchStockCache(ctx, variantId);
    return cache!;
  }

  async recordStockAdjustment(ctx: TenantContext, req: CreateStockAdjustmentRequest): Promise<{ adjustment: StockAdjustment; ledger: StockLedger }> {
    const existing = await prisma.stockAdjustment.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
    if (existing) {
      const ledger = await prisma.stockLedger.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
      if (!ledger) throw new Error("Idempotent adjustment exists without its ledger entry");
      return { adjustment: adjustmentShape(existing), ledger: ledgerShape(ledger) };
    }

    let variant = await prisma.productVariant.findUnique({ where: { id: req.variantId } });
    if (!variant) {
      variant = await prisma.productVariant.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          OR: [
            { id: `${req.variantId}-default` },
            { productId: req.variantId },
            { productId: (req as any).productId },
          ],
        },
      });
    }
    if (!variant) throw new Error(`Variant ${req.variantId} not found`);
    const resolvedVariantId = variant.id;
    assertTenantIsolation(ctx, variant.tenantId, variant.branchId);

    const result = await prisma.$transaction(async (tx: any) => {
      let changeQty = req.quantityChange;
      if (req.adjustmentType === "DECREASE") changeQty = -Math.abs(req.quantityChange);
      if (req.adjustmentType === "SET") {
        const ledgerRows = await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: resolvedVariantId } });
        const currentStock = calculateAvailableStock(ledgerRows.map(ledgerShape));
        changeQty = req.quantityChange - currentStock;
      }

      const adjustment = await tx.stockAdjustment.create({
        data: {
          id: req.id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          variantId: resolvedVariantId,
          adjustmentType: req.adjustmentType,
          quantityChange: changeQty,
          reason: req.reason,
          referenceNote: req.referenceNote ?? null,
          status: "COMPLETED",
          createdByUserId: ctx.userId,
          deviceId: req.deviceId,
          operationId: req.operationId,
          idempotencyKey: req.idempotencyKey,
        },
      });

      const ledger = await tx.stockLedger.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: variant.productId,
          variantId: req.variantId,
          movementType: "ADJUSTMENT",
          quantityChange: changeQty,
          quantity: changeQty,
          referenceType: "StockAdjustment",
          referenceId: adjustment.id,
          occurredAt: new Date(),
          deviceId: req.deviceId,
          operationId: req.operationId,
          idempotencyKey: req.idempotencyKey,
        },
      });
      return { adjustment, ledger };
    });

    return { adjustment: adjustmentShape(result.adjustment), ledger: ledgerShape(result.ledger) };
  }

  async getAvailableStock(ctx: TenantContext, variantId: string): Promise<number> {
    const rows = await prisma.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId } });
    return calculateAvailableStock(rows.map(ledgerShape));
  }

  async getLedger(ctx: TenantContext, variantId?: string): Promise<StockLedger[]> {
    const rows = await prisma.stockLedger.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, ...(variantId ? { variantId } : {}) },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(ledgerShape);
  }
}
