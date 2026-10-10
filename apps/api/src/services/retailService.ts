import { randomUUID } from "crypto";
import type {
  TenantContext,
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
import { prisma } from "@kwakopos2/database";
import { globalSettingsService } from "./settingsService.js";

export class RetailService {
  private engine?: RetailEngine;

  constructor(engine?: RetailEngine) {
    this.engine = engine;
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

  private toRetailPromotion(row: any): RetailPromotion {
    return {
      id: String(row.id),
      tenantId: String(row.tenantId),
      branchId: row.branchId ? String(row.branchId) : undefined,
      name: String(row.name),
      type: row.kind === "PERCENTAGE" ? "PERCENTAGE_DISCOUNT" : "FIXED_AMOUNT_DISCOUNT",
      discountValue: Number(row.value),
      minOrderAmount: row.minOrderAmount == null ? undefined : Number(row.minOrderAmount),
      startDate: new Date(row.startAt),
      endDate: new Date(row.endAt),
      isActive: Boolean(row.isActive),
      requiredRoleToApply: row.requiredPermission ? String(row.requiredPermission) : undefined,
    };
  }

  async createPromotion(
    ctx: TenantContext,
    promo: Omit<RetailPromotion, "id" | "tenantId">
  ): Promise<RetailPromotion> {
    const kind = promo.type === "PERCENTAGE_DISCOUNT"
      ? "PERCENTAGE"
      : promo.type === "FIXED_AMOUNT_DISCOUNT" ? "FIXED" : null;
    if (!kind) {
      // Never store unsupported promotion types as if their checkout semantics were implemented.
      throw new Error("RETAIL_PROMOTION_TYPE_UNSUPPORTED:" + promo.type);
    }
    if (promo.branchId && promo.branchId !== ctx.branchId) {
      throw new Error("RETAIL_PROMOTION_BRANCH_BOUNDARY_VIOLATION");
    }
    const value = Number(promo.discountValue);
    if (!Number.isFinite(value) || value < 0 || (kind === "PERCENTAGE" && value > 100)) {
      throw new Error("RETAIL_PROMOTION_VALUE_INVALID");
    }
    const startAt = new Date(promo.startDate);
    const endAt = new Date(promo.endDate);
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
      throw new Error("RETAIL_PROMOTION_DATE_RANGE_INVALID");
    }

    return prisma.$transaction(async (tx: any) => {
      const created = await tx.pricingPromotion.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          variantId: null,
          name: String(promo.name).trim(),
          kind,
          value,
          minQuantity: null,
          minOrderAmount: promo.minOrderAmount ?? null,
          startAt,
          endAt,
          isActive: promo.isActive !== false,
          priority: 0,
          stackable: false,
          requiredPermission: promo.requiredRoleToApply || "DISCOUNT_MANAGE",
          createdById: ctx.userId,
          sourceModule: "RETAIL",
        },
      });
      const event = this.getEngine().createAuditEvent(
        ctx, "RETAIL_PROMOTION_CREATED", "RetailPromotion", created.id,
        undefined, { ...promo, id: created.id, tenantId: ctx.tenantId }, "Created promotion " + promo.name
      );
      await tx.auditEvent.create({
        data: {
          id: event.eventId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.userId,
          deviceId: event.deviceId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          metadata: { module: "RETAIL", beforeState: null, afterState: event.afterState, reason: event.reason, timestamp: event.timestamp },
        },
      });
      return this.toRetailPromotion(created);
    });
  }

  async getPromotions(ctx: TenantContext): Promise<RetailPromotion[]> {
    const rows = await prisma.pricingPromotion.findMany({
      where: {
        tenantId: ctx.tenantId,
        sourceModule: "RETAIL",
        OR: [{ branchId: null }, { branchId: ctx.branchId }],
        isActive: true,
      },
      orderBy: [{ priority: "desc" }, { startAt: "desc" }],
    });
    return rows.map((row: any) => this.toRetailPromotion(row));
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

  async recordAuditEvent(
    ctx: TenantContext,
    action: string,
    entityType: string,
    entityId: string,
    beforeState?: Record<string, any>,
    afterState?: Record<string, any>,
    reason?: string
  ): Promise<RetailAuditEvent> {
    const event = this.getEngine().createAuditEvent(ctx, action, entityType, entityId, beforeState, afterState, reason);
    await prisma.auditEvent.create({
      data: {
        id: event.eventId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        deviceId: event.deviceId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: { module: "RETAIL", beforeState: event.beforeState ?? null, afterState: event.afterState ?? null, reason: event.reason ?? null, timestamp: event.timestamp },
      },
    });
    return event;
  }

  async getAuditEvents(ctx: TenantContext): Promise<RetailAuditEvent[]> {
    const rows = await prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        OR: [
          { entityType: { startsWith: "Retail" } },
          { action: { startsWith: "RETAIL_" } },
          { action: "POS_SALE_CHECKOUT" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row: any) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, any> : {};
      return {
        eventId: String(row.id),
        tenantId: String(row.tenantId),
        branchId: String(row.branchId),
        userId: String(row.userId),
        deviceId: String(row.deviceId),
        action: String(row.action),
        entityType: String(row.entityType),
        entityId: String(row.entityId),
        beforeState: metadata.beforeState ?? undefined,
        afterState: metadata.afterState ?? undefined,
        reason: metadata.reason ?? undefined,
        timestamp: String(metadata.timestamp || row.createdAt.toISOString()),
      };
    });
  }
}

export const globalRetailService = new RetailService();
