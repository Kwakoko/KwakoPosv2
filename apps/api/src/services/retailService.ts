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

  private settingsMap: Map<string, RetailSettings> = new Map();
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
    return {
      ...this.getEngine().getDefaultSettings(ctx.tenantId, ctx.branchId),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      currency: String(tax.currencyCode || "TZS"),
      taxRatePct: Number(tax.vatRatePercent ?? 0),
      taxInclusivePricing: tax.taxInclusivePricing !== false,
      allowNegativeStock: Boolean(inventory.allowNegativeStock),
      maxDiscountPctWithoutApproval: Number(pos.maxDiscountPercent ?? 15),
    };
  }

  async updateSettings(ctx: TenantContext, updates: Partial<RetailSettings>): Promise<RetailSettings> {
    const current = await this.getSettings(ctx);
    const updated: RetailSettings = { ...current, ...updates, tenantId: ctx.tenantId, branchId: ctx.branchId };
    const existingTax: any = (await globalSettingsService.getSettings(ctx))["tax.config"] || {};
    const existingPos: any = (await globalSettingsService.getSettings(ctx))["pos.config"] || {};
    await globalSettingsService.upsertBatch(ctx, [
      { key: "tax.config", scope: "BRANCH", value: { ...existingTax, currencyCode: updated.currency, vatRatePercent: updated.taxRatePct, taxInclusivePricing: updated.taxInclusivePricing } },
      { key: "pos.config", scope: "BRANCH", value: { ...existingPos, maxDiscountPercent: updated.maxDiscountPctWithoutApproval } },
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

  getReplenishmentSuggestions(ctx: TenantContext): RetailReplenishmentSuggestion[] {
    const products = this.productService.getProducts(ctx);
    const items: Array<{
      productId: string;
      variantId: string;
      productName: string;
      sku: string;
      currentStock: number;
      reorderLevel: number;
      costPrice: number;
    }> = [];

    for (const p of products) {
      const variants = p.variants || [];
      for (const v of variants) {
        const stock = this.stockRepo.getAvailableStock(ctx, v.id);
        items.push({
          productId: p.id,
          variantId: v.id,
          productName: `${p.name} - ${v.name}`,
          sku: v.sku,
          currentStock: stock,
          reorderLevel: 10,
          costPrice: v.costPrice,
        });
      }
    }

    const salesVelocityMap = new Map<string, number>();
    return this.getEngine().calculateReplenishmentSuggestions(items, salesVelocityMap);
  }

  getAiRecommendations(ctx: TenantContext): RetailAiRecommendation[] {
    const products = this.productService.getProducts(ctx);
    const inventory: Array<{ variantId: string; productName: string; currentStock: number; reorderLevel: number; costPrice: number }> = [];

    for (const p of products) {
      for (const v of p.variants || []) {
        const stock = this.stockRepo.getAvailableStock(ctx, v.id);
        inventory.push({
          variantId: v.id,
          productName: `${p.name} (${v.name})`,
          currentStock: stock,
          reorderLevel: 10,
          costPrice: v.costPrice,
        });
      }
    }

    const salesHistory = inventory.map((i) => ({
      variantId: i.variantId,
      sales30Days: Math.floor(Math.random() * 20),
      discountGiven: 0,
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
