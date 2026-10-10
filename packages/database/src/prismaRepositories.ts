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
  Category,
  Brand,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateBrandRequest,
  UpdateBrandRequest,
} from "@kwakopos2/contracts";
import {
  calculateAvailableStock,
  calculateStockAsOfDate,
  calculateBackdatedDiscrepancy,
  assertBackdatingThreshold,
  validateRetroactiveTimeline,
  assertTenantIsolation,
  assertBackdatingPermission,
} from "@kwakopos2/domain";
import { prisma } from "./client.js";
import {
  projectProductBranchStock,
  projectProductStockSummary,
  projectProductVariantBalance,
  projectVariantInventory,
  rejectAbsoluteInventoryMutation,
  rejectNonZeroAbsoluteInventoryMutation,
} from "./inventoryAuthority.js";

export const productShape = (row: any): Product => {
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
    hasVariants: Boolean(row.hasVariants),
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

export const variantShape = (row: any, parentBuyingPrice: number = 0, parentSellingPrice: number = 0): ProductVariant => {
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

export const ledgerShape = (row: any): StockLedger => ({
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
    if (req.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: req.categoryId } });
      if (!category || category.tenantId !== ctx.tenantId || category.branchId !== ctx.branchId || !category.isActive) throw new Error("Category entity belongs to another tenant/branch or is inactive");
    }
    const requestedBrandId = req.brandId ?? req.brand_id;
    if (requestedBrandId) {
      const brand = await prisma.brand.findUnique({ where: { id: requestedBrandId } });
      if (!brand || brand.tenantId !== ctx.tenantId || brand.branchId !== ctx.branchId || !brand.isActive) throw new Error("Brand entity belongs to another tenant/branch or is inactive");
    }
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
        categoryId: req.categoryId ?? null,
        brandId: req.brandId ?? req.brand_id ?? null,
        category: req.category ?? "General",
        isActive: true,
        buyingPrice: req.buyingPrice ?? 0,
        sellingPrice: req.sellingPrice ?? 0,
        taxId: req.taxId ?? null,
        supplierId: req.supplierId ?? null,
        images: req.images ?? [],
        hasVariants: Boolean(req.hasVariants),
        variants: {
          create: variantsToCreate.map((v: any) => ({
            id: v.id,
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            inheritBuyingPrice: v.inheritBuyingPrice ?? true,
            inheritSellingPrice: v.inheritSellingPrice ?? true,
            price: v.price ?? req.sellingPrice ?? 0,
            costPrice: v.costPrice ?? v.buyingPrice ?? req.buyingPrice ?? 0,
            inventoryQuantity: (() => {
              rejectNonZeroAbsoluteInventoryMutation(v);
              return 0;
            })(),
            reservedQuantity: v.reservedQuantity ?? 0,
            reorderLevel: v.reorderLevel ?? 0,
            imageUrl: v.imageUrl ?? null,
            attributes: v.attributes ?? {},
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
    if (req.categoryId !== undefined && req.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: req.categoryId } });
      if (!category || category.tenantId !== ctx.tenantId || category.branchId !== ctx.branchId || !category.isActive) throw new Error("Category entity belongs to another tenant/branch or is inactive");
    }
    const requestedBrandId = req.brandId !== undefined ? req.brandId : req.brand_id;
    if (requestedBrandId) {
      const brand = await prisma.brand.findUnique({ where: { id: requestedBrandId } });
      if (!brand || brand.tenantId !== ctx.tenantId || brand.branchId !== ctx.branchId || !brand.isActive) throw new Error("Brand entity belongs to another tenant/branch or is inactive");
    }
    const row = await prisma.product.update({
      where: { id },
      data: {
        name: req.name,
        description: req.description,
        sku: req.sku,
        categoryId: req.categoryId,
        brandId: req.brandId !== undefined ? req.brandId : req.brand_id,
        category: req.category,
        buyingPrice: req.buyingPrice,
        sellingPrice: req.sellingPrice,
        taxId: req.taxId,
        supplierId: req.supplierId,
        images: req.images,
        hasVariants: req.hasVariants,
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
        inheritBuyingPrice: req.inheritBuyingPrice ?? true,
        inheritSellingPrice: req.inheritSellingPrice ?? true,
        price: req.price ?? 0,
        costPrice: req.costPrice ?? 0,
        inventoryQuantity: (() => {
          rejectNonZeroAbsoluteInventoryMutation(req);
          return 0;
        })(),
        reservedQuantity: req.reservedQuantity ?? 0,
        reorderLevel: req.reorderLevel ?? 0,
        imageUrl: req.imageUrl ?? null,
        attributes: req.attributes ?? {},
        isActive: req.isActive ?? true,
      },
    });
    return variantShape(row);
  }

  async updateVariant(ctx: TenantContext, id: string, req: UpdateVariantRequest): Promise<ProductVariant> {
    rejectAbsoluteInventoryMutation(req);
    const existing = await prisma.productVariant.findUnique({ where: { id } });
    if (!existing) throw new Error(`Variant ${id} not found`);
    assertTenantIsolation(ctx, existing.tenantId, existing.branchId);
    const row = await prisma.productVariant.update({
      where: { id },
      data: {
        name: req.name,
        sku: req.sku,
        barcode: req.barcode,
        inheritBuyingPrice: req.inheritBuyingPrice,
        inheritSellingPrice: req.inheritSellingPrice,
        price: req.price,
        costPrice: req.costPrice,

        reservedQuantity: req.reservedQuantity,
        reorderLevel: req.reorderLevel,
        imageUrl: req.imageUrl,
        attributes: req.attributes,
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

  async recordPriceChange(ctx: TenantContext, req: any, db: any = prisma): Promise<any> {
    const newBuyingPrice = Number(req.newBuyingPrice);
    const newSellingPrice = Number(req.newSellingPrice);
    if (!Number.isFinite(newBuyingPrice) || newBuyingPrice < 0 ||
        !Number.isFinite(newSellingPrice) || newSellingPrice < 0) throw new Error("PRODUCT_PRICE_INVALID");
    const idempotencyKey = String(req.idempotencyKey || "").trim();
    if (!idempotencyKey) throw new Error("PRODUCT_PRICE_IDEMPOTENCY_KEY_REQUIRED");
    const effectiveFrom = new Date(req.effectiveFrom ?? Date.now());
    if (!Number.isFinite(effectiveFrom.getTime())) throw new Error("PRODUCT_PRICE_EFFECTIVE_FROM_INVALID");

    const apply = async (tx: any) => {
      const product = await tx.product.findFirst({ where: { id: req.productId, tenantId: ctx.tenantId, branchId: ctx.branchId } });
      if (!product) throw new Error("PRODUCT_PRICE_PRODUCT_NOT_FOUND");
      const variantId = req.variantId ? String(req.variantId) : null;
      let previousBuyingPrice = Number(product.buyingPrice ?? 0);
      let previousSellingPrice = Number(product.sellingPrice ?? 0);
      if (variantId) {
        const variant = await tx.productVariant.findFirst({ where: { id: variantId, productId: product.id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
        if (!variant) throw new Error("PRODUCT_PRICE_VARIANT_BOUNDARY_VIOLATION");
        previousBuyingPrice = Number(variant.costPrice);
        previousSellingPrice = Number(variant.price);
      }
      const existing = await tx.productPriceHistory.findUnique({ where: { idempotencyKey } });
      if (existing) {
        const sameRequest = existing.tenantId === ctx.tenantId && existing.branchId === ctx.branchId &&
          existing.productId === product.id && (existing.variantId ?? null) === variantId &&
          Number(existing.newBuyingPrice) === newBuyingPrice && Number(existing.newSellingPrice) === newSellingPrice;
        if (!sameRequest) throw new Error("PRODUCT_PRICE_IDEMPOTENCY_CONFLICT");
        return existing;
      }
      const where = { tenantId: ctx.tenantId, branchId: ctx.branchId, productId: product.id, ...(variantId ? { variantId } : {}) };
      const latest = await tx.productPriceHistory.findFirst({ where, orderBy: { versionNumber: "desc" } });
      const versionNumber = (latest?.versionNumber ?? 0) + 1;
      const marginAmount = newSellingPrice - newBuyingPrice;
      const marginPercentage = newSellingPrice > 0 ? (marginAmount / newSellingPrice) * 100 : 0;
      await tx.productPriceHistory.updateMany({ where: { ...where, effectiveTo: null }, data: { effectiveTo: effectiveFrom } });
      const history = await tx.productPriceHistory.create({ data: {
        id: String(req.id || randomUUID()), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: product.id, variantId,
        versionNumber, previousBuyingPrice, newBuyingPrice, previousSellingPrice, newSellingPrice,
        marginAmount, marginPercentage, changeType: String(req.changeType || "MANUAL_ADJUSTMENT"),
        changeReason: String(req.changeReason || "Price change"), effectiveFrom, changedByUserId: ctx.userId,
        deviceId: String(req.deviceId || "unknown"), idempotencyKey,
      }});
      if (variantId) await tx.productVariant.update({ where: { id: variantId }, data: { costPrice: newBuyingPrice, price: newSellingPrice } });
      else await tx.product.update({ where: { id: product.id }, data: { buyingPrice: newBuyingPrice, sellingPrice: newSellingPrice, currentMarginAmount: marginAmount, currentMarginPercentage: marginPercentage } });
      return history;
    };
    const row = db === prisma ? await prisma.$transaction((tx: any) => apply(tx)) : await apply(db);
    return {
      ...row, previousBuyingPrice: Number(row.previousBuyingPrice), newBuyingPrice: Number(row.newBuyingPrice),
      previousSellingPrice: Number(row.previousSellingPrice), newSellingPrice: Number(row.newSellingPrice),
      marginAmount: Number(row.marginAmount), marginPercentage: Number(row.marginPercentage),
      effectiveFrom: row.effectiveFrom.toISOString(), effectiveTo: row.effectiveTo?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getPriceHistory(ctx: TenantContext, productId: string, variantId?: string): Promise<any[]> {
    const product=await this.getProductById(ctx,productId); if(!product) throw new Error(`Product ${productId} not found`);
    const rows=await prisma.productPriceHistory.findMany({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,productId,...(variantId?{variantId}:{})},orderBy:[{versionNumber:'desc'},{effectiveFrom:'desc'}]});
    return rows.map((r:any)=>({...r,previousBuyingPrice:Number(r.previousBuyingPrice),newBuyingPrice:Number(r.newBuyingPrice),previousSellingPrice:Number(r.previousSellingPrice),newSellingPrice:Number(r.newSellingPrice),marginAmount:Number(r.marginAmount),marginPercentage:Number(r.marginPercentage),effectiveFrom:r.effectiveFrom.toISOString(),effectiveTo:r.effectiveTo?.toISOString()??null,createdAt:r.createdAt.toISOString()}));
  }
}

export class PrismaCatalogRepository {
  private categoryShape(row: any): Category {
    return { id: row.id, tenantId: row.tenantId, branchId: row.branchId, name: row.name, code: row.code, parentId: row.parentId ?? null, description: row.description ?? null, color: row.color ?? null, isActive: row.isActive !== false, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private brandShape(row: any): Brand {
    return { id: row.id, tenantId: row.tenantId, branchId: row.branchId, name: row.name, code: row.code, origin: row.origin ?? null, notes: row.notes ?? null, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private async assertValidCategoryParent(
    db: any,
    ctx: TenantContext,
    categoryId: string | undefined,
    parentId: string | null | undefined,
  ): Promise<void> {
    if (!parentId) return;
    if (categoryId && parentId === categoryId) throw new Error("Category cannot be its own parent");
    const visited = new Set<string>();
    let cursorId: string | null = parentId;
    while (cursorId) {
      if (visited.has(cursorId)) throw new Error("Category hierarchy contains an existing cycle");
      visited.add(cursorId);
      const parent: any = await db.category.findUnique({ where: { id: cursorId } });
      if (!parent || parent.tenantId !== ctx.tenantId || parent.branchId !== ctx.branchId || !parent.isActive) throw new Error("Parent category belongs to another tenant/branch or is inactive");
      if (categoryId && parent.id === categoryId) throw new Error("Category hierarchy cannot contain a circular parent chain");
      cursorId = parent.parentId ?? null;
    }
  }

  /** Production tenants start with zero business master data. */
  async ensureDefaults(_ctx: TenantContext): Promise<void> {
    return;
  }

  async listCategories(ctx: TenantContext): Promise<Category[]> {
    await this.ensureDefaults(ctx);
    const rows = await prisma.category.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return rows.map((r: any) => this.categoryShape(r));
  }

  async createCategory(ctx: TenantContext, req: CreateCategoryRequest): Promise<Category> {
    await this.assertValidCategoryParent(prisma, ctx, req.id, req.parentId);
    const row = await prisma.category.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, name: req.name.trim(), code: req.code.trim().toUpperCase(), parentId: req.parentId ?? null, description: req.description?.trim() || null, color: req.color?.trim() || null } });
    return this.categoryShape(row);
  }

  async updateCategory(ctx: TenantContext, id: string, req: UpdateCategoryRequest): Promise<Category> {
    const row = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.category.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("Category not found");
      if (req.parentId !== undefined) await this.assertValidCategoryParent(tx, ctx, id, req.parentId);
      const updated = await tx.category.update({ where: { id }, data: { name: req.name?.trim(), code: req.code?.trim().toUpperCase(), parentId: req.parentId !== undefined ? req.parentId : undefined, description: req.description !== undefined ? (req.description.trim() || null) : undefined, color: req.color !== undefined ? (req.color.trim() || null) : undefined, isActive: req.isActive } });
      if (req.name !== undefined && req.cascadeAssignedProducts !== false && req.name.trim() !== existing.name) await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: id }, data: { category: req.name.trim() } });
      return updated;
    });
    return this.categoryShape(row);
  }

  async deleteCategory(ctx: TenantContext, id: string, replacementId?: string): Promise<{ deleted: boolean; reassigned: number }> {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.category.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("Category not found");
      const count = await tx.product.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: id, isActive: true } });
      const childCount = await tx.category.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, parentId: id, isActive: true } });
      if (count > 0 && !replacementId) throw new Error("Category has assigned products; replacementId is required");
      if (childCount > 0) throw new Error("Category has active child categories; remove or reassign them before deleting");
      if (replacementId) {
        if (replacementId === id) throw new Error("Replacement category must differ from deleted category");
        const replacement = await tx.category.findUnique({ where: { id: replacementId } });
        if (!replacement || replacement.tenantId !== ctx.tenantId || replacement.branchId !== ctx.branchId || !replacement.isActive) throw new Error("Replacement category is invalid");
        await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: id }, data: { categoryId: replacementId, category: replacement.name } });
      }
      await tx.category.update({ where: { id }, data: { isActive: false } });
      return { deleted: true, reassigned: count };
    });
  }

  async listBrands(ctx: TenantContext): Promise<Brand[]> {
    await this.ensureDefaults(ctx);
    const rows = await prisma.brand.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return rows.map((r: any) => this.brandShape(r));
  }

  async createBrand(ctx: TenantContext, req: CreateBrandRequest): Promise<Brand> {
    const row = await prisma.brand.create({ data: { id: req.id, tenantId: ctx.tenantId, branchId: ctx.branchId, name: req.name.trim(), code: req.code.trim().toUpperCase(), origin: req.origin?.trim() || null, notes: req.notes?.trim() || null } });
    return this.brandShape(row);
  }

  async updateBrand(ctx: TenantContext, id: string, req: UpdateBrandRequest): Promise<Brand> {
    const existing = await prisma.brand.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("Brand not found");
    const row = await prisma.brand.update({ where: { id }, data: { name: req.name?.trim(), code: req.code?.trim().toUpperCase(), origin: req.origin !== undefined ? (req.origin.trim() || null) : undefined, notes: req.notes !== undefined ? (req.notes.trim() || null) : undefined, isActive: req.isActive } });
    return this.brandShape(row);
  }

  async deleteBrand(ctx: TenantContext, id: string, replacementId?: string): Promise<{ deleted: boolean; reassigned: number }> {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.brand.findUnique({ where: { id } });
      if (!existing || existing.tenantId !== ctx.tenantId || existing.branchId !== ctx.branchId) throw new Error("Brand not found");
      const count = await tx.product.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, brandId: id, isActive: true } });
      if (count > 0 && !replacementId) throw new Error("Brand has assigned products; replacementId is required");
      if (replacementId) {
        if (replacementId === id) throw new Error("Replacement brand must differ from deleted brand");
        const replacement = await tx.brand.findUnique({ where: { id: replacementId } });
        if (!replacement || replacement.tenantId !== ctx.tenantId || replacement.branchId !== ctx.branchId || !replacement.isActive) throw new Error("Replacement brand is invalid");
        await tx.product.updateMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, brandId: id }, data: { brandId: replacementId } });
      }
      await tx.brand.update({ where: { id }, data: { isActive: false } });
      return { deleted: true, reassigned: count };
    });
  }
}

export class PrismaStockRepository {
  async recordMovement(ctx: TenantContext, req: any): Promise<StockLedger> {
    if (req.occurredAt) {
      assertBackdatingThreshold(req.occurredAt);
      if (Math.abs(Date.now() - new Date(req.occurredAt).getTime()) > 5 * 60 * 1000) {
        assertBackdatingPermission(ctx);
      }
    }
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.stockLedger.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: req.idempotencyKey } });
      if (existing) return existing;
      await tx.$queryRawUnsafe('SELECT id FROM "product_variants" WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE', req.variantId, ctx.tenantId, ctx.branchId);
      const variant = await tx.productVariant.findUnique({ where: { id: req.variantId } });
      if (!variant) throw new Error(`Variant ${req.variantId} not found`);
      assertTenantIsolation(ctx, variant.tenantId, variant.branchId);
      const beforeRow = await tx.stockLedger.aggregate({ _sum: { quantityChange: true }, where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: req.variantId } });
      const currentQuantityBefore = Number(beforeRow._sum.quantityChange ?? 0);
      const quantityChange = Number(req.quantityChange ?? req.quantity ?? 0);
      const movementTime = req.occurredAt ? new Date(req.occurredAt) : new Date();
      const isBackdated = Boolean(req.occurredAt) && Math.abs(Date.now() - movementTime.getTime()) > 5 * 60 * 1000;
      if (isBackdated) {
        assertBackdatingPermission(ctx);
        const timelineRows = await tx.stockLedger.findMany({
          where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: req.variantId },
          orderBy: { occurredAt: "asc" },
        });
        const validation = validateRetroactiveTimeline(timelineRows.map(ledgerShape), movementTime, quantityChange);
        if (!validation.valid) {
          throw new Error(
            `INSUFFICIENT_STOCK: Retroactive movement would cause stock to drop below zero on ${validation.violationDate} (balance: ${validation.lowestIntermediateBalance}).`
          );
        }
        const closedPeriod = await tx.accountingPeriod.findFirst({
          where: {
            tenantId: ctx.tenantId,
            startDate: { lte: movementTime },
            endDate: { gte: movementTime },
            status: { in: ["CLOSED", "LOCKED"] },
          },
        });
        if (closedPeriod) {
          const code = closedPeriod.status === "LOCKED" ? "ACCOUNTING_PERIOD_LOCKED" : "ACCOUNTING_PERIOD_CLOSED";
          throw new Error(`${code}: Cannot backdate inventory movement into accounting period "${closedPeriod.name}".`);
        }
      }
      const historicalRows = isBackdated
        ? (await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: req.variantId, occurredAt: { lt: movementTime } }, orderBy: { occurredAt: "asc" } })).map(ledgerShape)
        : [];
      const historicalQuantityBefore = isBackdated ? calculateAvailableStock(historicalRows) : currentQuantityBefore;
      const quantityBefore = isBackdated ? historicalQuantityBefore : currentQuantityBefore;
      const quantityAfter = quantityBefore + quantityChange;
      if (quantityAfter < 0) {
        throw new Error(
          isBackdated
            ? "INSUFFICIENT_STOCK: stock cannot become negative at historical movement point"
            : "INSUFFICIENT_STOCK: stock cannot become negative"
        );
      }
      const unitCost = Number(req.unitCost ?? variant.costPrice ?? 0);
      const row = await tx.stockLedger.create({
        data: { tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: req.variantId, warehouseId: req.warehouseId ?? null, movementType: req.movementType, quantityBefore, quantityChange, quantity: quantityChange, quantityAfter, unitCost, totalCost: Math.abs(quantityChange) * unitCost, referenceType: req.referenceType, referenceId: req.referenceId ?? null, occurredAt: movementTime, createdAt: new Date(), deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: req.idempotencyKey },
      });
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, req.variantId);
      await projectProductVariantBalance(tx, ctx.tenantId, ctx.branchId, req.variantId);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, req.variantId, req.warehouseId ?? null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
      return row;
    });
    return ledgerShape(result);
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
    const existing = await prisma.stockAdjustment.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: req.idempotencyKey } });
    if (existing) {
      const ledger = await prisma.stockLedger.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, idempotencyKey: req.idempotencyKey } });
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

    if (req.occurredAt) {
      assertBackdatingThreshold(req.occurredAt);
    }

    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM "product_variants" WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3 FOR UPDATE', resolvedVariantId, ctx.tenantId, ctx.branchId);
      const ledgerRowsBefore = await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: resolvedVariantId }, orderBy: { occurredAt: "asc" } });
      const currentStock = calculateAvailableStock(ledgerRowsBefore.map(ledgerShape));
      const isBackdated = Boolean(req.occurredAt) && Math.abs(Date.now() - new Date(req.occurredAt!).getTime()) > 5 * 60 * 1000;
      const historicalRowsBefore = isBackdated
        ? ledgerRowsBefore.filter((r: any) => new Date(r.occurredAt || r.createdAt).getTime() < new Date(req.occurredAt!).getTime())
        : [];
      const historicalStockBefore = isBackdated ? calculateAvailableStock(historicalRowsBefore.map(ledgerShape)) : currentStock;
      const quantityBefore = isBackdated ? historicalStockBefore : currentStock;
      let changeQty = req.quantityChange;

      if (req.adjustmentType === "DECREASE") {
        changeQty = -Math.abs(req.quantityChange);
      } else if (req.adjustmentType === "SET") {
        if (req.occurredAt) {
          const historicalRows = ledgerRowsBefore.filter(
            (r: any) => new Date(r.occurredAt || r.createdAt).getTime() < new Date(req.occurredAt!).getTime()
          );
          const historicalStock = calculateAvailableStock(historicalRows.map(ledgerShape));
          changeQty = calculateBackdatedDiscrepancy(req.quantityChange, historicalStock);
        } else {
          changeQty = req.quantityChange - quantityBefore;
        }
      }

      // Validate retroactive timeline if backdated to prevent negative intermediate stock
      if (req.occurredAt) {
        const validation = validateRetroactiveTimeline(ledgerRowsBefore.map(ledgerShape), req.occurredAt, changeQty);
        if (!validation.valid) {
          throw new Error(
            `INSUFFICIENT_STOCK: Retroactive adjustment would cause stock to drop below zero on ${validation.violationDate} (balance: ${validation.lowestIntermediateBalance}).`
          );
        }

        const occurredDate = new Date(req.occurredAt);
        const closedPeriod = await tx.accountingPeriod.findFirst({
          where: {
            tenantId: ctx.tenantId,
            startDate: { lte: occurredDate },
            endDate: { gte: occurredDate },
            status: { in: ["CLOSED", "LOCKED"] },
          },
        });
        if (closedPeriod) {
          const code = closedPeriod.status === "LOCKED" ? "ACCOUNTING_PERIOD_LOCKED" : "ACCOUNTING_PERIOD_CLOSED";
          throw new Error(`${code}: Cannot backdate inventory adjustment into accounting period "${closedPeriod.name}".`);
        }
      }

      const quantityAfter = quantityBefore + changeQty;
      const currentProjectedStock = currentStock + changeQty;
      if (quantityAfter < 0 || currentProjectedStock < 0) throw new Error("INSUFFICIENT_STOCK: stock cannot become negative");

      const movementTime = req.occurredAt ? new Date(req.occurredAt) : new Date();

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
          id: req.ledgerId || undefined,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          warehouseId: (req as any).warehouseId ?? null,
          productId: variant.productId,
          variantId: resolvedVariantId,
          movementType: req.movementType || (changeQty >= 0 ? "ADJUSTMENT_GAIN" : "ADJUSTMENT_LOSS"),
          referenceType: "ADJUSTMENT",
          referenceId: adjustment.id,
          quantityBefore,
          quantityChange: changeQty,
          quantity: changeQty,
          quantityAfter,
          unitCost: req.unitCost ?? 0,
          totalCost: Math.abs(changeQty) * (req.unitCost ?? 0),
          userId: req.userId ?? ctx.userId,
          occurredAt: movementTime,
          createdAt: new Date(),
          deviceId: req.deviceId,
          operationId: req.operationId,
          idempotencyKey: req.idempotencyKey,
          notes: req.notes ?? req.referenceNote ?? null,
        },
      });

      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, resolvedVariantId);
      await projectProductVariantBalance(tx, ctx.tenantId, ctx.branchId, resolvedVariantId);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, resolvedVariantId, (req as any).warehouseId ?? null);
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, variant.productId);
      return { adjustment, ledger };
    });

    return { adjustment: adjustmentShape(result.adjustment), ledger: ledgerShape(result.ledger) };
  }

  async getStockAsOfDate(ctx: TenantContext, variantId: string, asOfDate: string | Date): Promise<number> {
    assertBackdatingThreshold(asOfDate);
    const targetDate = new Date(asOfDate);
    const rows = await prisma.stockLedger.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        variantId,
        occurredAt: { lte: targetDate },
      },
      orderBy: { occurredAt: "asc" },
    });
    return calculateAvailableStock(rows.map(ledgerShape));
  }

  async getLedger(ctx: TenantContext, variantId?: string): Promise<StockLedger[]> {
    const rows = await prisma.stockLedger.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        ...(variantId ? { variantId } : {}),
      },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(ledgerShape);
  }

  async getAvailableStock(ctx: TenantContext, variantId: string): Promise<number> {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { reservedQuantity: true, tenantId: true, branchId: true } });
    if (variant && (variant.tenantId !== ctx.tenantId || variant.branchId !== ctx.branchId)) throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
    const rows = await prisma.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId }, orderBy: { occurredAt: "asc" } });
    const ledgerBalance = calculateAvailableStock(rows.map(ledgerShape));
    return Math.max(0, ledgerBalance - Number(variant?.reservedQuantity || 0));
  }
}



