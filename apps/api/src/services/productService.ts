import { randomUUID } from "crypto";
import type {
  TenantContext,
  Product,
  ProductVariant,
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

  getAvailableStock(ctx: TenantContext, variantId: string): number {
    return this.stockRepo.getAvailableStock(ctx, variantId);
  }
}

export const globalProductService = new ProductService();
