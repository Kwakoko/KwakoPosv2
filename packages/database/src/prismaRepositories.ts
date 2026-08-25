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
import { prisma } from "./index";

const productShape = (row: any): Product => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  name: row.name,
  description: row.description ?? null,
  sku: row.sku,
  category: row.category,
  isActive: row.isActive,
  variants: (row.variants || []).map(variantShape),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const variantShape = (row: any): ProductVariant => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  productId: row.productId,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode ?? null,
  price: Number(row.price),
  costPrice: Number(row.costPrice),
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const ledgerShape = (row: any): StockLedger => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  productId: row.productId,
  variantId: row.variantId,
  movementType: row.movementType,
  quantity: Number(row.quantity),
  referenceType: row.referenceType,
  referenceId: row.referenceId ?? null,
  occurredAt: row.occurredAt.toISOString(),
  deviceId: row.deviceId,
  operationId: row.operationId,
  idempotencyKey: row.idempotencyKey,
  createdAt: row.createdAt.toISOString(),
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
        variants: {
          create: (req.variants || []).map((v) => ({
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
}

export class PrismaStockRepository {
  async recordStockAdjustment(ctx: TenantContext, req: CreateStockAdjustmentRequest): Promise<{ adjustment: StockAdjustment; ledger: StockLedger }> {
    const existing = await prisma.stockAdjustment.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
    if (existing) {
      const ledger = await prisma.stockLedger.findUnique({ where: { idempotencyKey: req.idempotencyKey } });
      if (!ledger) throw new Error("Idempotent adjustment exists without its ledger entry");
      return { adjustment: adjustmentShape(existing), ledger: ledgerShape(ledger) };
    }

    const variant = await prisma.productVariant.findUnique({ where: { id: req.variantId } });
    if (!variant) throw new Error(`Variant ${req.variantId} not found`);
    assertTenantIsolation(ctx, variant.tenantId, variant.branchId);

    const result = await prisma.$transaction(async (tx) => {
      let changeQty = req.quantityChange;
      if (req.adjustmentType === "DECREASE") changeQty = -Math.abs(req.quantityChange);
      if (req.adjustmentType === "SET") {
        const ledgerRows = await tx.stockLedger.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: req.variantId } });
        const currentStock = calculateAvailableStock(ledgerRows.map(ledgerShape));
        changeQty = req.quantityChange - currentStock;
      }

      const adjustment = await tx.stockAdjustment.create({
        data: {
          id: req.id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          variantId: req.variantId,
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
