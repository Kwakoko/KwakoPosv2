import { randomUUID } from "crypto";
import type {
  TenantContext,
  Product,
  ProductVariant,
  Sale,
  RetailModuleManifest,
  RetailSettings,
  RetailPromotion,
  RetailReplenishmentSuggestion,
  RetailAiRecommendation,
  RetailAuditEvent,
} from "@kwakopos2/contracts";
import {
  globalRetailEngine,
  RetailEngine,
} from "@kwakopos2/domain";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  globalInMemoryStore,
  InMemoryStore,
  prisma,
} from "@kwakopos2/database";
import { globalProductService, ProductService } from "./productService.js";
import { globalSettingsService } from "./settingsService.js";

export class RetailService {
  private engine?: RetailEngine;
  private store: InMemoryStore;
  private productService: ProductService;
  private productRepo: ScopedProductRepository;
  private stockRepo: ScopedStockRepository;
  private commercialRepo: ScopedCommercialRepository;

  private promotionsMap: Map<string, RetailPromotion> = new Map();
  private auditEventsMap: Map<string, RetailAuditEvent[]> = new Map();

  constructor(
    engine?: RetailEngine,
    store?: InMemoryStore,
    productService?: ProductService
  ) {
    this.engine = engine;
    this.store = store || globalInMemoryStore;
    this.productService = productService || globalProductService;
    this.productRepo = new ScopedProductRepository(this.store);
    this.stockRepo = new ScopedStockRepository(this.store);
    this.commercialRepo = new ScopedCommercialRepository(this.store);
  }

  private getEngine(): RetailEngine {
    if (!this.engine) {
      this.engine = globalRetailEngine || new RetailEngine();
    }
    return this.engine;
  }

  getManifest(): RetailModuleManifest {
    return this.getEngine().getModuleManifest();
  }

  async getSettings(ctx: TenantContext): Promise<RetailSettings> {
    const settings = await globalSettingsService.getSettings(ctx);
    const tax: any = settings["tax.config"] || {};
    const pos: any = settings["pos.config"] || {};
    const inventory: any = settings["inventory.config"] || {};
    const retail: any = settings["retail.config"] || {};
    const defaults = this.getEngine().getDefaultSettings(ctx.tenantId, ctx.branchId);
    return {
      ...defaults, tenantId: ctx.tenantId, branchId: ctx.branchId,
      currency: String(retail.currency ?? tax.currencyCode ?? defaults.currency),
      taxRatePct: tax.vatEnabled === false ? 0 : Number(tax.vatRatePercent ?? defaults.taxRatePct),
      taxInclusivePricing: tax.taxInclusivePricing !== false,
      allowNegativeStock: Boolean(inventory.allowNegativeStock),
      maxDiscountPctWithoutApproval: Number(pos.maxDiscountPercent ?? defaults.maxDiscountPctWithoutApproval),
      requireReceiptForReturn: retail.requireReceiptForReturn ?? defaults.requireReceiptForReturn,
      skuPrefix: String(retail.skuPrefix ?? defaults.skuPrefix),
      barcodeFormat: retail.barcodeFormat ?? defaults.barcodeFormat,
      stockValuationMethod: retail.stockValuationMethod ?? defaults.stockValuationMethod,
      receiptHeader: String(retail.receiptHeader ?? defaults.receiptHeader),
      receiptFooter: String(retail.receiptFooter ?? defaults.receiptFooter),
    };
  }

  async updateSettings(ctx: TenantContext, updates: Partial<RetailSettings>): Promise<RetailSettings> {
    const current = await this.getSettings(ctx);
    const updated: RetailSettings = { ...current, ...updates, tenantId: ctx.tenantId, branchId: ctx.branchId };
    const currentSettings = await globalSettingsService.getSettings(ctx);
    const existingTax: any = currentSettings["tax.config"] || {};
    const existingPos: any = currentSettings["pos.config"] || {};
    const existingInventory: any = currentSettings["inventory.config"] || {};
    const existingRetail: any = currentSettings["retail.config"] || {};
    await globalSettingsService.upsertBatch(ctx, [
      { key: "retail.config", scope: "BRANCH", value: {
        ...existingRetail, currency: updated.currency, requireReceiptForReturn: updated.requireReceiptForReturn,
        skuPrefix: updated.skuPrefix, barcodeFormat: updated.barcodeFormat, stockValuationMethod: updated.stockValuationMethod,
        receiptHeader: updated.receiptHeader, receiptFooter: updated.receiptFooter,
      } },
      { key: "tax.config", scope: "BRANCH", value: {
        ...existingTax, currencyCode: updated.currency, vatRatePercent: updated.taxRatePct,
        vatEnabled: updated.taxRatePct > 0, taxInclusivePricing: updated.taxInclusivePricing,
      } },
      { key: "pos.config", scope: "BRANCH", value: { ...existingPos, maxDiscountPercent: updated.maxDiscountPctWithoutApproval } },
      { key: "inventory.config", scope: "BRANCH", value: { ...existingInventory, allowNegativeStock: updated.allowNegativeStock } },
    ]);
    return updated;
  }

  createPromotion(ctx: TenantContext, promo: Omit<RetailPromotion, "id" | "tenantId">): RetailPromotion {
    const id = `PROMO-${randomUUID().slice(0, 8)}`;
    const fullPromo: RetailPromotion = {
      ...promo,
      id,
      tenantId: ctx.tenantId,
      branchId: promo.branchId || ctx.branchId,
    };
    this.promotionsMap.set(id, fullPromo);
    this.recordAuditEvent(ctx, "PROMOTION_CREATE", "RetailPromotion", id, undefined, fullPromo, `Created promotion ${promo.name}`);
    return fullPromo;
  }

  getPromotions(ctx: TenantContext): RetailPromotion[] {
    return Array.from(this.promotionsMap.values()).filter(
      (p) => p.tenantId === ctx.tenantId && (p.branchId === ctx.branchId || !p.branchId) && p.isActive
    );
  }

  async processPOSCheckout(
    ctx: TenantContext,
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discountAmount?: number;
    }>,
    payments: Array<{ amount: number; paymentMethod: "CASH" | "CARD" | "MOBILE_MONEY" | "CREDIT" }>,
    cartDiscountPct: number = 0,
    customerId?: string
  ): Promise<Sale> {
    const settings = await this.getSettings(ctx);
    const totals = this.getEngine().calculatePOSCartTotals(
      items,
      cartDiscountPct,
      settings.taxRatePct,
      settings.taxInclusivePricing
    );

    const { sale } = this.commercialRepo.createPosSale(ctx, {
      customerId,
      items: items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unitCost: i.unitCost,
        discountAmount: i.discountAmount || 0,
      })),
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      payments: payments.map((p) => ({
        amount: p.amount,
        paymentMethod: p.paymentMethod,
      })),
      deviceId: "POS-TERMINAL-01",
      operationId: randomUUID(),
      idempotencyKey: `POS-SALE-${randomUUID()}`,
    });

    this.recordAuditEvent(ctx, "POS_SALE_CHECKOUT", "Sale", sale.id, undefined, sale, `Completed sale #${sale.saleNumber}`);
    return sale;
  }

  private async getAuthoritativeRetailSignals(ctx: TenantContext) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [variants, stockRows, sales, returns] = await Promise.all([
      prisma.productVariant.findMany({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true }, include: { product: true } }),
      prisma.stockLedger.groupBy({ by: ["variantId"], where: { tenantId: ctx.tenantId, branchId: ctx.branchId }, _sum: { quantityChange: true } }),
      prisma.sale.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: "COMPLETED", soldAt: { gte: since } },
        select: { lines: { select: { variantId: true, quantity: true } } },
      }),
      prisma.return.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: "COMPLETED", createdAt: { gte: since } },
        select: { lines: { select: { variantId: true, quantityReturned: true } } },
      }),
    ]);
    const stockByVariant = new Map<string, number>();
    for (const row of stockRows) stockByVariant.set(row.variantId, Number(row._sum.quantityChange ?? 0));
    const soldByVariant = new Map<string, number>();
    for (const sale of sales) for (const line of sale.lines) {
      soldByVariant.set(line.variantId, (soldByVariant.get(line.variantId) || 0) + Number(line.quantity));
    }
    for (const ret of returns) for (const line of ret.lines) {
      soldByVariant.set(line.variantId, Math.max(0, (soldByVariant.get(line.variantId) || 0) - Number(line.quantityReturned)));
    }
    return { variants, stockByVariant, soldByVariant };
  }

  async getReplenishmentSuggestions(ctx: TenantContext): Promise<RetailReplenishmentSuggestion[]> {
    const signals = await this.getAuthoritativeRetailSignals(ctx);
    const items = signals.variants.map((variant) => ({
      productId: variant.productId, variantId: variant.id, productName: variant.product.name + " - " + variant.name,
      sku: variant.sku,
      currentStock: Math.max(0, (signals.stockByVariant.get(variant.id) || 0) - Number(variant.reservedQuantity || 0)),
      reorderLevel: Math.max(0, Number(variant.reorderLevel || 0)), costPrice: Number(variant.costPrice || 0),
      preferredSupplierId: (variant.product as any).supplierId || undefined,
    }));
    const salesVelocityMap = new Map<string, number>();
    for (const variant of signals.variants) salesVelocityMap.set(variant.id, (signals.soldByVariant.get(variant.id) || 0) / 30);
    return this.getEngine().calculateReplenishmentSuggestions(items, salesVelocityMap);
  }

  async getAiRecommendations(ctx: TenantContext): Promise<RetailAiRecommendation[]> {
    const signals = await this.getAuthoritativeRetailSignals(ctx);
    const inventory = signals.variants.map((variant) => ({
      variantId: variant.id, productName: variant.product.name + " (" + variant.name + ")",
      currentStock: Math.max(0, (signals.stockByVariant.get(variant.id) || 0) - Number(variant.reservedQuantity || 0)),
      reorderLevel: Math.max(0, Number(variant.reorderLevel || 0)), costPrice: Number(variant.costPrice || 0),
    }));
    const salesHistory = signals.variants.map((variant) => ({
      variantId: variant.id, sales30Days: signals.soldByVariant.get(variant.id) || 0, discountGiven: 0,
    }));
    return this.getEngine().generateExplainableAiRecommendations(ctx, inventory, salesHistory);
  }

  recordAuditEvent(
    ctx: TenantContext,
    action: string,
    entityType: string,
    entityId: string,
    beforeState?: Record<string, any>,
    afterState?: Record<string, any>,
    reason?: string
  ): RetailAuditEvent {
    const event = this.getEngine().createAuditEvent(ctx, action, entityType, entityId, beforeState, afterState, reason);
    const key = ctx.tenantId;
    if (!this.auditEventsMap.has(key)) {
      this.auditEventsMap.set(key, []);
    }
    this.auditEventsMap.get(key)!.push(event);
    return event;
  }

  getAuditEvents(ctx: TenantContext): RetailAuditEvent[] {
    return this.auditEventsMap.get(ctx.tenantId) || [];
  }
}

export const globalRetailService = new RetailService();
