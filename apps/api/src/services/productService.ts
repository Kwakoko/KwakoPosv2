import { randomUUID } from "crypto";
import type {
  TenantContext,
  Product,
  ProductVariant,
  StockLedger,
  ProductBranchStock,
  ProductPriceHistory,
  CreatePriceChangeRequest,
  CreateStockMovementRequest,
  CreateProductRequest,
  UpdateProductRequest,
  CreateVariantRequest,
  UpdateVariantRequest,
} from "@kwakopos2/contracts";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";
import {
  calculateAvailableStock,
  assertProductVariantImmutability,
  assertVariantIdentityPersistence,
  assertTenantIsolation,
} from "@kwakopos2/domain";

export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrandRequest {
  id?: string;
  name: string;
  code: string;
  description?: string;
}

/**
 * Product Service — Production Catalog & Brand Persistence Engine
 * Supports seamless camelCase brandId and snake_case brand_id compatibility
 * with multi-tenant isolation, variant persistence, and stock ledger tracking.
 */
export class ProductService {
  private productRepo: ScopedProductRepository;
  private stockRepo: ScopedStockRepository;
  private store: InMemoryStore;
  private brands: Map<string, Brand> = new Map();

  constructor(
    productRepo?: ScopedProductRepository,
    stockRepo?: ScopedStockRepository,
    store?: InMemoryStore
  ) {
    this.store = store || globalInMemoryStore;
    this.productRepo = productRepo || new ScopedProductRepository(this.store);
    this.stockRepo = stockRepo || new ScopedStockRepository(this.store);
  }

  createBrand(ctx: TenantContext, req: CreateBrandRequest): Brand {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const brand: Brand = {
      id,
      tenantId: ctx.tenantId,
      name: req.name,
      code: req.code.toUpperCase(),
      description: req.description || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.brands.set(id, brand);
    return brand;
  }

  getBrands(ctx: TenantContext): Brand[] {
    return Array.from(this.brands.values()).filter(
      (b) => b.tenantId === ctx.tenantId && b.isActive
    );
  }

  getBrandById(ctx: TenantContext, brandId: string): Brand | null {
    const brand = this.brands.get(brandId);
    if (!brand || brand.tenantId !== ctx.tenantId) return null;
    return brand;
  }

  createProduct(
    ctx: TenantContext,
    req: CreateProductRequest & { brandId?: string; brand_id?: string }
  ): Product {
    const brandId = req.brandId || req.brand_id || null;
    const brand_id = brandId;

    if (brandId) {
      const rawBrand = this.brands.get(brandId);
      if (rawBrand && rawBrand.tenantId !== ctx.tenantId) {
        throw new Error(`Cross-tenant brand breach! Brand ${brandId} does not belong to tenant ${ctx.tenantId}`);
      }
    }

    const product = this.productRepo.createProduct(ctx, {
      ...req,
      brandId: brandId || undefined,
      brand_id: brand_id || undefined,
    });

    return product;
  }

  getProductById(ctx: TenantContext, productId: string): Product | null {
    const product = this.productRepo.getProductById(ctx, productId);
    if (!product) return null;
    assertTenantIsolation(ctx, product.tenantId, product.branchId);

    const brandId = product.brandId || product.brand_id || null;
    const brand_id = brandId;

    return {
      ...product,
      brandId,
      brand_id,
    };
  }

  getProducts(ctx: TenantContext, filter?: { brandId?: string; brand_id?: string; categoryId?: string }): Product[] {
    let products = this.productRepo.getProducts(ctx);

    const targetBrand = filter?.brandId || filter?.brand_id;
    if (targetBrand) {
      products = products.filter(
        (p) => (p.brandId === targetBrand || p.brand_id === targetBrand)
      );
    }

    if (filter?.categoryId) {
      products = products.filter((p) => p.categoryId === filter.categoryId);
    }

    return products.map((p) => ({
      ...p,
      brandId: p.brandId || p.brand_id || null,
      brand_id: p.brandId || p.brand_id || null,
    }));
  }

  updateProduct(
    ctx: TenantContext,
    productId: string,
    req: UpdateProductRequest & { brandId?: string; brand_id?: string }
  ): Product {
    const existing = this.getProductById(ctx, productId);
    if (!existing) throw new Error(`Product ${productId} not found`);
    assertTenantIsolation(ctx, existing.tenantId, existing.branchId);

    const brandId =
      req.brandId !== undefined
        ? req.brandId
        : req.brand_id !== undefined
        ? req.brand_id
        : existing.brandId || existing.brand_id || null;
    const brand_id = brandId;

    if (brandId) {
      const rawBrand = this.brands.get(brandId);
      if (rawBrand && rawBrand.tenantId !== ctx.tenantId) {
        throw new Error(`Cross-tenant brand breach! Brand ${brandId} does not belong to tenant ${ctx.tenantId}`);
      }
    }

    return this.productRepo.updateProduct(ctx, productId, {
      ...req,
      brandId: brandId || undefined,
      brand_id: brand_id || undefined,
    });
  }

  addVariant(ctx: TenantContext, productId: string, req: CreateVariantRequest): ProductVariant {
    return this.productRepo.addVariant(ctx, productId, req);
  }

  updateVariant(ctx: TenantContext, variantId: string, req: UpdateVariantRequest): ProductVariant {
    return this.productRepo.updateVariant(ctx, variantId, req);
  }

  deleteVariant(ctx: TenantContext, variantId: string): boolean {
    return this.productRepo.deleteVariant(ctx, variantId);
  }

  generateVariantsForProduct(
    ctx: TenantContext,
    productId: string,
    attributes: Array<{ name: string; values: string[] }>,
    baseSku?: string
  ): ProductVariant[] {
    const product = this.getProductById(ctx, productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    const cleanBaseSku = baseSku || product.sku;
    const cartesian = (arrays: string[][]): string[][] =>
      arrays.reduce<string[][]>((acc, curr) => acc.flatMap((d) => curr.map((e) => [...d, e])), [[]]);

    const valueArrays = attributes.map((a) => a.values);
    const combinations = cartesian(valueArrays);
    const created: ProductVariant[] = [];

    for (const combo of combinations) {
      const attrMap: Record<string, string> = {};
      attributes.forEach((attr, i) => {
        attrMap[attr.name] = combo[i];
      });

      const comboStr = combo.join(" / ");
      const skuSuffix = combo
        .map((v) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3))
        .join("-");
      const sku = `${cleanBaseSku}-${skuSuffix}`;
      const barcodeSeed = Math.floor(10000000 + Math.random() * 90000000).toString();

      const variant = this.addVariant(ctx, productId, {
        name: `${product.name} (${comboStr})`,
        sku,
        barcode: `BAR-${barcodeSeed}`,
        inheritBuyingPrice: true,
        inheritSellingPrice: true,
        costPrice: product.buyingPrice || 0,
        price: product.sellingPrice || 0,
        attributes: attrMap,
      });

      created.push(variant);
    }

    return created;
  }

  bulkUpdateVariants(
    ctx: TenantContext,
    productId: string,
    req: {
      variantIds: string[];
      action: "UPDATE_PRICES" | "UPDATE_STOCK" | "SET_STATUS";
      priceData?: { inheritBuyingPrice?: boolean; inheritSellingPrice?: boolean; costPrice?: number; price?: number };
      stockData?: { mode: "SET" | "ADD"; quantity: number };
      isActive?: boolean;
    }
  ): ProductVariant[] {
    const product = this.getProductById(ctx, productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    const updatedVariants: ProductVariant[] = [];

    for (const vId of req.variantIds) {
      const variant = (product.variants || []).find((v) => v.id === vId);
      if (!variant) continue;

      if (req.action === "UPDATE_PRICES" && req.priceData) {
        this.updateVariant(ctx, vId, {
          inheritBuyingPrice: req.priceData.inheritBuyingPrice,
          inheritSellingPrice: req.priceData.inheritSellingPrice,
          costPrice: req.priceData.costPrice,
          price: req.priceData.price,
        });
        const updatedProduct = this.getProductById(ctx, productId);
        const updated = updatedProduct?.variants?.find((v) => v.id === vId);
        if (updated) updatedVariants.push(updated);
      } else if (req.action === "UPDATE_STOCK" && req.stockData) {
        const currentStock = this.stockRepo.getAvailableStock(ctx, vId);
        const targetQuantity = req.stockData.mode === "ADD" ? currentStock + req.stockData.quantity : req.stockData.quantity;

        // Record stock adjustment ledger entry for audit trail
        this.stockRepo.recordStockAdjustment(ctx, {
          variantId: vId,
          adjustmentType: "SET",
          quantityChange: Math.max(0, targetQuantity),
          reason: "BULK_STOCK_UPDATE",
          deviceId: "SYSTEM_CONSOLE",
          operationId: randomUUID(),
          idempotencyKey: `bulk-stock-${vId}-${Date.now()}`,
        });

        const updatedProduct = this.getProductById(ctx, productId);
        const updated = updatedProduct?.variants?.find((v) => v.id === vId);
        if (updated) updatedVariants.push(updated);
      } else if (req.action === "SET_STATUS" && req.isActive !== undefined) {
        const updated = this.updateVariant(ctx, vId, {
          isActive: req.isActive,
        });
        updatedVariants.push(updated);
      }
    }

    return updatedVariants;
  }

  searchVariantsForPos(
    ctx: TenantContext,
    query: string
  ): Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    barcode: string | null;
    effectiveSellingPrice: number;
    effectiveBuyingPrice: number;
    availableStock: number;
    attributes?: Record<string, string>;
  }> {
    const q = query.trim().toLowerCase();
    const products = this.getProducts(ctx);
    const results: Array<{
      productId: string;
      variantId: string;
      productName: string;
      variantName: string;
      sku: string;
      barcode: string | null;
      effectiveSellingPrice: number;
      effectiveBuyingPrice: number;
      availableStock: number;
      attributes?: Record<string, string>;
    }> = [];

    for (const p of products) {
      const pMatch = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      for (const v of p.variants || []) {
        if (!v.isActive) continue;

        const barcodeMatch = v.barcode ? v.barcode.toLowerCase() === q : false;
        const skuMatch = v.sku.toLowerCase().includes(q);
        const nameMatch = v.name.toLowerCase().includes(q);

        if (barcodeMatch || skuMatch || nameMatch || pMatch) {
          const effectiveSelling = v.effectiveSellingPrice ?? (v.inheritSellingPrice ? p.sellingPrice : v.price);
          const effectiveBuying = v.effectiveBuyingPrice ?? (v.inheritBuyingPrice ? p.buyingPrice : v.costPrice);

          results.push({
            productId: p.id,
            variantId: v.id,
            productName: p.name,
            variantName: v.name,
            sku: v.sku,
            barcode: v.barcode || null,
            effectiveSellingPrice: effectiveSelling,
            effectiveBuyingPrice: effectiveBuying,
            availableStock: v.availableStock ?? Math.max(0, (v.stock || 0) - (v.reservedQuantity || 0)),
            attributes: v.attributes,
          });
        }
      }
    }

    return results;
  }

  getAvailableStock(ctx: TenantContext, variantId: string): number {
    return this.stockRepo.getAvailableStock(ctx, variantId);
  }

  recordStockMovement(ctx: TenantContext, req: CreateStockMovementRequest): StockLedger {
    return this.stockRepo.recordMovement(ctx, req);
  }

  getProductStockHistory(ctx: TenantContext, productId: string, variantId?: string): {
    productId: string;
    productName: string;
    currentStock: number;
    movements: StockLedger[];
  } {
    const product = this.getProductById(ctx, productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    let ledgers = this.stockRepo.getLedger(ctx, variantId);
    ledgers = ledgers.filter((l) => l.productId === productId);

    return {
      productId: product.id,
      productName: product.name,
      currentStock: product.totalStock,
      movements: ledgers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    };
  }

  getProductBranchStockCache(ctx: TenantContext, variantId: string): ProductBranchStock | null {
    return this.stockRepo.getProductBranchStockCache(ctx, variantId);
  }

  recalculateStockCache(ctx: TenantContext, variantId?: string): ProductBranchStock[] {
    return this.stockRepo.recalculateStockCacheFromLedger(ctx, variantId);
  }

  recordPriceChange(
    ctx: TenantContext,
    req: CreatePriceChangeRequest
  ): { priceHistory: ProductPriceHistory; product: Product; variant?: ProductVariant } {
    return this.productRepo.recordPriceChange(ctx, req);
  }

  getPriceHistory(ctx: TenantContext, productId: string, variantId?: string): ProductPriceHistory[] {
    return this.productRepo.getPriceHistory(ctx, productId, variantId);
  }
}

export const globalProductService = new ProductService();
