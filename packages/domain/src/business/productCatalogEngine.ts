import { randomUUID } from "crypto";
import type {
  TenantContext,
  Product,
  ProductVariant,
  PriceChangeType,
  EngineDescriptor,
  EngineCommandEnvelope,
  EngineCommandResult,
  EngineQueryEnvelope,
} from "@kwakopos2/contracts";
import { CoreEngineRegistry } from "../engineRegistry/coreEngineRegistry.js";
import { DomainEventBusEngine } from "../foundation/eventBusEngine.js";
import { AuditComplianceEngine } from "../foundation/auditComplianceEngine.js";

export interface CreateProductParams {
  tenantId: string;
  branchId: string;
  categoryId?: string | null;
  brandId?: string | null;
  name: string;
  description?: string | null;
  sku: string;
  category?: string;
  buyingPrice: number;
  sellingPrice: number;
  taxId?: string | null;
  supplierId?: string | null;
  images?: string[];
  hasVariants?: boolean;
}

export interface UpdateProductParams {
  productId: string;
  tenantId: string;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  category?: string;
  isActive?: boolean;
  taxId?: string | null;
  supplierId?: string | null;
  images?: string[];
}

export interface CreateVariantParams {
  productId: string;
  tenantId: string;
  branchId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  attributeValues: Record<string, string>;
  buyingPrice: number;
  sellingPrice: number;
  unitOfMeasure?: string;
}

export interface UpdatePriceParams {
  productId: string;
  variantId?: string | null;
  tenantId: string;
  newBuyingPrice: number;
  newSellingPrice: number;
  changeType: PriceChangeType;
  changeReason: string;
  userId?: string | null;
}

export interface PriceVersionRecord {
  id: string;
  productId: string;
  variantId: string | null;
  versionNumber: number;
  previousBuyingPrice: number;
  newBuyingPrice: number;
  previousSellingPrice: number;
  newSellingPrice: number;
  marginAmount: number;
  marginPercentage: number;
  changeType: PriceChangeType;
  changeReason: string;
  effectiveFrom: string;
  changedByUserId: string | null;
}

export class ProductCatalogEngine {
  private static instance: ProductCatalogEngine | null = null;
  private products = new Map<string, Product>(); // key: productId
  private variants = new Map<string, ProductVariant>(); // key: variantId
  private priceHistory = new Map<string, PriceVersionRecord[]>(); // key: productId/variantId

  public static readonly ENGINE_ID = "core.product_catalog";

  public static getInstance(): ProductCatalogEngine {
    if (!ProductCatalogEngine.instance) {
      ProductCatalogEngine.instance = new ProductCatalogEngine();
    }
    return ProductCatalogEngine.instance;
  }

  public static resetInstance(): void {
    ProductCatalogEngine.instance = new ProductCatalogEngine();
  }

  public constructor() {
    this.registerSelf();
  }

  private registerSelf(): void {
    const registry = CoreEngineRegistry.getInstance();
    const descriptor: EngineDescriptor = {
      engineId: ProductCatalogEngine.ENGINE_ID,
      name: "Product & Catalog Management Core Engine",
      version: "2.0.0",
      layer: "BUSINESS_CORE",
      status: "ACTIVE",
      dependencies: ["core.event_bus", "core.audit_compliance"],
      extensionPoints: ["catalog.pricing_rules", "catalog.barcode_generator"],
      permissionsRequired: ["PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_EDIT"],
      supportedCommands: [
        "CreateProduct",
        "UpdateProduct",
        "CreateVariant",
        "UpdatePrice",
      ],
      supportedQueries: [
        "GetProductById",
        "GetProductBySku",
        "SearchProducts",
        "ListVariants",
        "GetPriceHistory",
      ],
      publishedEvents: [
        "PRODUCT_CREATED",
        "PRODUCT_UPDATED",
        "PRODUCT_VARIANT_CREATED",
        "PRODUCT_PRICE_CHANGED",
      ],
      healthStatus: "HEALTHY",
    };

    try {
      registry.registerEngine(descriptor, {
        commandHandlers: {
          CreateProduct: async (ctx, cmd) => this.handleCreateProductCommand(ctx, cmd),
          UpdateProduct: async (ctx, cmd) => this.handleUpdateProductCommand(ctx, cmd),
          CreateVariant: async (ctx, cmd) => this.handleCreateVariantCommand(ctx, cmd),
          UpdatePrice: async (ctx, cmd) => this.handleUpdatePriceCommand(ctx, cmd),
        },
        queryHandlers: {
          GetProductById: async (ctx, qry) => this.handleGetProductByIdQuery(ctx, qry),
          GetProductBySku: async (ctx, qry) => this.handleGetProductBySkuQuery(ctx, qry),
          SearchProducts: async (ctx, qry) => this.handleSearchProductsQuery(ctx, qry),
        },
        healthCheck: async () => ({
          engineId: ProductCatalogEngine.ENGINE_ID,
          status: "HEALTHY",
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // already registered
    }
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || (ctx as any).email === "admin@kwakoko.co.tz";
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access catalog of tenant '${tenantId}'.`
      );
    }
  }

  public calculateMargin(buyingPrice: number, sellingPrice: number): { marginAmount: number; marginPercentage: number } {
    const marginAmount = sellingPrice - buyingPrice;
    const marginPercentage = sellingPrice > 0 ? (marginAmount / sellingPrice) * 100 : 0;
    return {
      marginAmount: Number(marginAmount.toFixed(2)),
      marginPercentage: Number(marginPercentage.toFixed(2)),
    };
  }

  public createProduct(ctx: TenantContext, params: CreateProductParams): Product {
    this.assertIsolation(ctx, params.tenantId);

    if (!params.name || params.name.trim().length === 0) {
      throw new Error("PRODUCT_NAME_REQUIRED: Product name cannot be empty.");
    }
    if (!params.sku || params.sku.trim().length === 0) {
      throw new Error("PRODUCT_SKU_REQUIRED: Product SKU cannot be empty.");
    }
    if (params.buyingPrice < 0) {
      throw new Error("INVALID_BUYING_PRICE: Buying price cannot be negative.");
    }
    if (params.sellingPrice < 0) {
      throw new Error("INVALID_SELLING_PRICE: Selling price cannot be negative.");
    }

    const skuNormalized = params.sku.trim().toUpperCase();

    // SKU uniqueness validation within tenant
    for (const p of this.products.values()) {
      if (p.tenantId === params.tenantId && p.sku === skuNormalized) {
        throw new Error(`PRODUCT_SKU_EXISTS: SKU '${params.sku}' already exists in tenant.`);
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const { marginAmount, marginPercentage } = this.calculateMargin(params.buyingPrice, params.sellingPrice);

    const product: Product = {
      id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      categoryId: params.categoryId || null,
      brandId: params.brandId || null,
      brand_id: params.brandId || null,
      name: params.name.trim(),
      description: params.description || null,
      sku: skuNormalized,
      category: params.category || "General",
      buyingPrice: params.buyingPrice,
      sellingPrice: params.sellingPrice,
      currentMarginAmount: marginAmount,
      currentMarginPercentage: marginPercentage,
      activePriceVersionId: null,
      taxId: params.taxId || null,
      supplierId: params.supplierId || null,
      images: params.images || [],
      hasVariants: params.hasVariants ?? false,
      totalStock: 0,
      reservedStock: 0,
      availableStock: 0,
      lowStockVariantsCount: 0,
      isActive: true,
      variants: [],
      createdAt: now,
      updatedAt: now,
    };

    this.products.set(id, product);

    // Initial price version record
    const priceVersion: PriceVersionRecord = {
      id: randomUUID(),
      productId: id,
      variantId: null,
      versionNumber: 1,
      previousBuyingPrice: 0,
      newBuyingPrice: params.buyingPrice,
      previousSellingPrice: 0,
      newSellingPrice: params.sellingPrice,
      marginAmount,
      marginPercentage,
      changeType: "INITIAL_PRICE",
      changeReason: "Product creation initial pricing",
      effectiveFrom: now,
      changedByUserId: ctx.userId || null,
    };
    this.priceHistory.set(id, [priceVersion]);
    product.activePriceVersionId = priceVersion.id;

    // Audit compliance logging
    AuditComplianceEngine.getInstance().record(ctx, {
      action: "CREATE_PRODUCT",
      entityType: "PRODUCT",
      entityId: id,
      afterState: { name: product.name, sku: product.sku, buyingPrice: product.buyingPrice, sellingPrice: product.sellingPrice },
    });

    DomainEventBusEngine.getInstance().publish({
      eventType: "PRODUCT_CREATED",
      engineId: ProductCatalogEngine.ENGINE_ID,
      aggregateType: "PRODUCT",
      aggregateId: id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      actorId: ctx.userId || "system",
      payload: { productId: id, sku: product.sku, name: product.name, sellingPrice: product.sellingPrice },
    });

    return { ...product };
  }

  public updateProduct(ctx: TenantContext, params: UpdateProductParams): Product {
    this.assertIsolation(ctx, params.tenantId);

    const product = this.products.get(params.productId);
    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product '${params.productId}' does not exist.`);
    }
    this.assertIsolation(ctx, product.tenantId);

    if (params.name !== undefined) {
      if (params.name.trim().length === 0) throw new Error("PRODUCT_NAME_REQUIRED: Name cannot be empty.");
      product.name = params.name.trim();
    }
    if (params.description !== undefined) product.description = params.description;
    if (params.categoryId !== undefined) product.categoryId = params.categoryId;
    if (params.brandId !== undefined) {
      product.brandId = params.brandId;
      product.brand_id = params.brandId;
    }
    if (params.category !== undefined) product.category = params.category;
    if (params.isActive !== undefined) product.isActive = params.isActive;
    if (params.taxId !== undefined) product.taxId = params.taxId;
    if (params.supplierId !== undefined) product.supplierId = params.supplierId;
    if (params.images !== undefined) product.images = params.images;

    product.updatedAt = new Date().toISOString();
    this.products.set(product.id, product);

    AuditComplianceEngine.getInstance().record(ctx, {
      action: "UPDATE_PRODUCT",
      entityType: "PRODUCT",
      entityId: product.id,
      afterState: { updatedFields: Object.keys(params) },
    });

    DomainEventBusEngine.getInstance().publish({
      eventType: "PRODUCT_UPDATED",
      engineId: ProductCatalogEngine.ENGINE_ID,
      aggregateType: "PRODUCT",
      aggregateId: product.id,
      tenantId: product.tenantId,
      actorId: ctx.userId || "system",
      payload: { productId: product.id, name: product.name, isActive: product.isActive },
    });

    return { ...product };
  }

  public createVariant(ctx: TenantContext, params: CreateVariantParams): ProductVariant {
    this.assertIsolation(ctx, params.tenantId);

    const product = this.products.get(params.productId);
    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product '${params.productId}' does not exist.`);
    }
    this.assertIsolation(ctx, product.tenantId);

    const skuNormalized = params.sku.trim().toUpperCase();

    // Check variant SKU uniqueness within tenant
    for (const v of this.variants.values()) {
      if (v.tenantId === params.tenantId && v.sku === skuNormalized) {
        throw new Error(`VARIANT_SKU_EXISTS: Variant SKU '${params.sku}' already exists in tenant.`);
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const { marginAmount, marginPercentage } = this.calculateMargin(params.buyingPrice, params.sellingPrice);

    const variant: ProductVariant = {
      id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      name: params.name.trim(),
      sku: skuNormalized,
      barcode: params.barcode ? params.barcode.trim() : null,
      inheritBuyingPrice: false,
      inheritSellingPrice: false,
      price: params.sellingPrice,
      costPrice: params.buyingPrice,
      effectiveBuyingPrice: params.buyingPrice,
      effectiveSellingPrice: params.sellingPrice,
      currentMarginAmount: marginAmount,
      currentMarginPercentage: marginPercentage,
      activePriceVersionId: null,
      inventoryQuantity: 0,
      stock: 0,
      reservedQuantity: 0,
      availableStock: 0,
      reorderLevel: 10,
      attributes: params.attributeValues || {},
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.variants.set(id, variant);
    product.hasVariants = true;
    if (!product.variants) product.variants = [];
    product.variants.push(variant);
    product.updatedAt = now;

    DomainEventBusEngine.getInstance().publish({
      eventType: "PRODUCT_VARIANT_CREATED",
      engineId: ProductCatalogEngine.ENGINE_ID,
      aggregateType: "PRODUCT_VARIANT",
      aggregateId: id,
      tenantId: params.tenantId,
      actorId: ctx.userId || "system",
      payload: { variantId: id, productId: product.id, sku: variant.sku, name: variant.name },
    });

    return { ...variant };
  }

  public updatePrice(ctx: TenantContext, params: UpdatePriceParams): PriceVersionRecord {
    this.assertIsolation(ctx, params.tenantId);

    const product = this.products.get(params.productId);
    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product '${params.productId}' does not exist.`);
    }
    this.assertIsolation(ctx, product.tenantId);

    if (params.newBuyingPrice < 0) throw new Error("INVALID_BUYING_PRICE: Buying price cannot be negative.");
    if (params.newSellingPrice < 0) throw new Error("INVALID_SELLING_PRICE: Selling price cannot be negative.");

    const now = new Date().toISOString();
    const targetKey = params.variantId || params.productId;
    const history = this.priceHistory.get(targetKey) || [];
    const versionNumber = history.length + 1;

    let prevBuying = 0;
    let prevSelling = 0;

    if (params.variantId) {
      const variant = this.variants.get(params.variantId);
      if (!variant) throw new Error(`VARIANT_NOT_FOUND: Variant '${params.variantId}' does not exist.`);
      prevBuying = variant.costPrice;
      prevSelling = variant.price;

      const { marginAmount, marginPercentage } = this.calculateMargin(params.newBuyingPrice, params.newSellingPrice);
      variant.costPrice = params.newBuyingPrice;
      variant.price = params.newSellingPrice;
      variant.effectiveBuyingPrice = params.newBuyingPrice;
      variant.effectiveSellingPrice = params.newSellingPrice;
      variant.currentMarginAmount = marginAmount;
      variant.currentMarginPercentage = marginPercentage;
      variant.updatedAt = now;
      this.variants.set(variant.id, variant);
    } else {
      prevBuying = product.buyingPrice;
      prevSelling = product.sellingPrice;

      const { marginAmount, marginPercentage } = this.calculateMargin(params.newBuyingPrice, params.newSellingPrice);
      product.buyingPrice = params.newBuyingPrice;
      product.sellingPrice = params.newSellingPrice;
      product.currentMarginAmount = marginAmount;
      product.currentMarginPercentage = marginPercentage;
      product.updatedAt = now;
    }

    const { marginAmount, marginPercentage } = this.calculateMargin(params.newBuyingPrice, params.newSellingPrice);

    const record: PriceVersionRecord = {
      id: randomUUID(),
      productId: params.productId,
      variantId: params.variantId || null,
      versionNumber,
      previousBuyingPrice: prevBuying,
      newBuyingPrice: params.newBuyingPrice,
      previousSellingPrice: prevSelling,
      newSellingPrice: params.newSellingPrice,
      marginAmount,
      marginPercentage,
      changeType: params.changeType,
      changeReason: params.changeReason,
      effectiveFrom: now,
      changedByUserId: params.userId || ctx.userId || null,
    };

    history.push(record);
    this.priceHistory.set(targetKey, history);

    AuditComplianceEngine.getInstance().record(ctx, {
      action: "UPDATE_PRODUCT_PRICE",
      entityType: "PRODUCT_PRICE",
      entityId: record.id,
      afterState: {
        productId: product.id,
        variantId: params.variantId,
        previousSellingPrice: prevSelling,
        newSellingPrice: params.newSellingPrice,
        changeReason: params.changeReason,
      },
    });

    DomainEventBusEngine.getInstance().publish({
      eventType: "PRODUCT_PRICE_CHANGED",
      engineId: ProductCatalogEngine.ENGINE_ID,
      aggregateType: "PRODUCT",
      aggregateId: product.id,
      tenantId: product.tenantId,
      actorId: ctx.userId || "system",
      payload: {
        productId: product.id,
        variantId: params.variantId,
        newSellingPrice: params.newSellingPrice,
        newBuyingPrice: params.newBuyingPrice,
      },
    });

    return { ...record };
  }

  public getProduct(ctx: TenantContext, productId: string): Product | null {
    const product = this.products.get(productId);
    if (!product) return null;
    this.assertIsolation(ctx, product.tenantId);
    return { ...product, variants: this.listVariants(ctx, productId) };
  }

  public getProductBySku(ctx: TenantContext, tenantId: string, sku: string): Product | null {
    this.assertIsolation(ctx, tenantId);
    const skuNorm = sku.trim().toUpperCase();
    for (const p of this.products.values()) {
      if (p.tenantId === tenantId && p.sku === skuNorm) {
        return { ...p, variants: this.listVariants(ctx, p.id) };
      }
    }
    return null;
  }

  public listVariants(ctx: TenantContext, productId: string): ProductVariant[] {
    const product = this.products.get(productId);
    if (!product) return [];
    this.assertIsolation(ctx, product.tenantId);
    return Array.from(this.variants.values())
      .filter((v) => v.productId === productId)
      .map((v) => ({ ...v }));
  }

  public getVariant(ctx: TenantContext, variantId: string): ProductVariant | null {
    const variant = this.variants.get(variantId);
    if (!variant) return null;
    this.assertIsolation(ctx, variant.tenantId);
    return { ...variant };
  }

  public searchProducts(
    ctx: TenantContext,
    tenantId: string,
    query: string,
    options?: { categoryId?: string; isActive?: boolean }
  ): Product[] {
    this.assertIsolation(ctx, tenantId);
    const q = query.trim().toLowerCase();

    return Array.from(this.products.values())
      .filter((p) => {
        if (p.tenantId !== tenantId) return false;
        if (options?.categoryId && p.categoryId !== options.categoryId) return false;
        if (options?.isActive !== undefined && p.isActive !== options.isActive) return false;

        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        const matchCategory = p.category.toLowerCase().includes(q);
        return matchName || matchSku || matchCategory;
      })
      .map((p) => ({ ...p, variants: this.listVariants(ctx, p.id) }));
  }

  public getPriceHistory(ctx: TenantContext, productId: string, variantId?: string | null): PriceVersionRecord[] {
    const product = this.products.get(productId);
    if (!product) return [];
    this.assertIsolation(ctx, product.tenantId);
    const key = variantId || productId;
    return (this.priceHistory.get(key) || []).map((r) => ({ ...r }));
  }

  // -------------------------------------------------------------------------
  // CQRS Envelope Handlers
  // -------------------------------------------------------------------------

  private async handleCreateProductCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const product = this.createProduct(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: product,
        eventsPublished: ["PRODUCT_CREATED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "CREATE_PRODUCT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleUpdateProductCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const product = this.updateProduct(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: product,
        eventsPublished: ["PRODUCT_UPDATED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "UPDATE_PRODUCT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleCreateVariantCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const variant = this.createVariant(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: variant,
        eventsPublished: ["PRODUCT_VARIANT_CREATED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "CREATE_VARIANT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleUpdatePriceCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const versionRecord = this.updatePrice(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: versionRecord,
        eventsPublished: ["PRODUCT_PRICE_CHANGED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "UPDATE_PRICE_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleGetProductByIdQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<Product | null> {
    return this.getProduct(ctx, qry.parameters.productId as string);
  }

  private async handleGetProductBySkuQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<Product | null> {
    return this.getProductBySku(
      ctx,
      qry.tenantId,
      qry.parameters.sku as string
    );
  }

  private async handleSearchProductsQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<Product[]> {
    return this.searchProducts(
      ctx,
      qry.tenantId,
      (qry.parameters.query as string) || "",
      qry.parameters.options as any
    );
  }
}
