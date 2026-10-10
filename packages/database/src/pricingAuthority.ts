import type { TenantContext } from "@kwakopos2/contracts";
import { PricingTaxEngine } from "@kwakopos2/domain";

const MANAGER_ROLES = new Set(["ADMIN","OWNER","SUPER_ADMIN","SUPERADMIN","MANAGER","BRANCH_MANAGER"]);

function canOverridePrice(ctx: TenantContext): boolean {
  const roles = (ctx.roles || []).map((r) => String(r).trim().toUpperCase());
  const permissions = (ctx.permissions || []).map((p) => String(p).trim().toLowerCase());
  return roles.some((r) => MANAGER_ROLES.has(r))
    || permissions.includes("*")
    || permissions.includes("pricing.manage")
    || permissions.includes("price.override")
    || permissions.includes("sales.price_override");
}

function assertEffectiveDates(effectiveFrom: Date, effectiveTo?: Date | null): void {
  if (Number.isNaN(effectiveFrom.getTime())) throw new Error("PRICING_EFFECTIVE_FROM_INVALID");
  if (effectiveTo && (Number.isNaN(effectiveTo.getTime()) || effectiveTo <= effectiveFrom)) {
    throw new Error("PRICING_EFFECTIVE_TO_INVALID");
  }
}

export interface PricingResolutionInput {
  variantId: string;
  productId?: string;
  customerId?: string;
  quantity: number;
  requestedUnitPrice?: number;
  priceListId?: string;
  priceOverrideReason?: string;
  now?: Date;
}

export interface PricingResolution {
  unitPrice: number;
  source: "CUSTOMER" | "PROMOTION" | "WHOLESALE" | "BULK" | "BRANCH" | "PRICE_LIST" | "BASE";
  sourceId?: string;
  productId: string;
  variantId: string;
  customerPriceId?: string;
  priceListItemId?: string;
  pricingTierId?: string;
  promotionId?: string;
  promotionalBasePrice?: number;
  overrideApplied: boolean;
  requestedUnitPrice?: number;
  overrideReason?: string;
}

export class PricingAuthority {
  static async resolveUnitPrice(tx: any, ctx: TenantContext, input: PricingResolutionInput): Promise<PricingResolution> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("PRICING_QUANTITY_INVALID");
    const now = input.now || new Date();

    const variant = await tx.productVariant.findUnique({ where: { id: input.variantId } });
    if (!variant || variant.tenantId !== ctx.tenantId || variant.branchId !== ctx.branchId || variant.isActive === false) {
      throw new Error("PRICING_VARIANT_BOUNDARY_VIOLATION");
    }
    if (input.productId && input.productId !== variant.productId) throw new Error("PRICING_PRODUCT_VARIANT_MISMATCH");

    const product = await tx.product.findUnique({ where: { id: variant.productId } });
    if (!product || product.tenantId !== ctx.tenantId || product.branchId !== ctx.branchId || product.isActive === false) {
      throw new Error("PRICING_PRODUCT_BOUNDARY_VIOLATION");
    }

    const inheritedSellingPrice = Number(product.sellingPrice || 0);
    const variantSellingPrice = Number(variant.price || 0);
    const basePrice = variant.inheritSellingPrice
      ? (inheritedSellingPrice > 0 ? inheritedSellingPrice : variantSellingPrice)
      : variantSellingPrice;
    const branchPrice = undefined;

    let customerPrice: any = null;
    let customer: any = null;
    if (input.customerId) {
      customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer || customer.tenantId !== ctx.tenantId || customer.branchId !== ctx.branchId || customer.status !== "ACTIVE") {
        throw new Error("PRICING_CUSTOMER_BOUNDARY_VIOLATION");
      }
      customerPrice = tx.customerPrice
        ? await tx.customerPrice.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          customerId: customer.id,
          variantId: variant.id,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }],
      })
        : null;
    }

    let priceListItem: any = null;
    if (input.priceListId) {
      if (!tx.priceList || !tx.priceListItem) throw new Error("PRICE_LIST_NOT_AVAILABLE");
      const list = await tx.priceList.findFirst({
        where: { id: input.priceListId, tenantId: ctx.tenantId, branchId: ctx.branchId },
      });
      if (!list) throw new Error("PRICE_LIST_NOT_FOUND");
      priceListItem = await tx.priceListItem.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          priceListId: list.id,
          variantId: variant.id,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }],
      });
    } else if (tx.priceList && tx.priceListItem) {
      const defaultList = await tx.priceList.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, isDefault: true },
        orderBy: { updatedAt: "desc" },
      });
      if (defaultList) {
        priceListItem = await tx.priceListItem.findFirst({
          where: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            priceListId: defaultList.id,
            variantId: variant.id,
            isActive: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }],
        });
      }
    }

    const bulkTier = tx.pricingTier
      ? await tx.pricingTier.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        variantId: variant.id,
        kind: "BULK",
        isActive: true,
        minQuantity: { lte: input.quantity },
        AND: [{ OR: [{ maxQuantity: null }, { maxQuantity: { gte: input.quantity } }] }, { effectiveFrom: { lte: now } }, { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }],
      },
      orderBy: [{ minQuantity: "desc" }, { priority: "desc" }, { effectiveFrom: "desc" }],
    })
      : null;

    const wholesaleTier = input.customerId && tx.pricingTier
      ? await tx.pricingTier.findFirst({
          where: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            variantId: variant.id,
            kind: "WHOLESALE",
            isActive: true,
            minQuantity: { lte: input.quantity },
            AND: [
              { OR: [{ customerSegment: null }, { customerSegment: customer?.customerSegment || null }] },
              { OR: [{ maxQuantity: null }, { maxQuantity: { gte: input.quantity } }] },
              { effectiveFrom: { lte: now } },
              { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
            ],
          },
          orderBy: [{ minQuantity: "desc" }, { priority: "desc" }, { effectiveFrom: "desc" }],
        })
      : null;

    const promotions = tx.pricingPromotion
      ? await tx.pricingPromotion.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ branchId: null }, { branchId: ctx.branchId }],
        isActive: true,
        startAt: { lte: now },
        endAt: { gt: now },
        AND: [
          { OR: [{ sourceModule: null }, { sourceModule: { not: "RETAIL" } }] },
          { OR: [{ variantId: null }, { variantId: variant.id }] },
          { OR: [{ minQuantity: null }, { minQuantity: { lte: input.quantity } }] },
          { OR: [{ minOrderAmount: null }, { minOrderAmount: { lte: (Number(variant.price) * input.quantity) } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { startAt: "desc" }],
      take: 10,
    })
      : [];

    let bestTierPrice = basePrice;
    let source: PricingResolution["source"] = "BASE";
    let sourceId: string | undefined;
    let priceListPrice: number | undefined;
    let bulkPrice: number | undefined;
    let wholesalePrice: number | undefined;
    if (priceListItem) priceListPrice = Number(priceListItem.unitPrice);
    if (bulkTier) bulkPrice = Number(bulkTier.unitPrice);
    if (wholesaleTier) wholesalePrice = Number(wholesaleTier.unitPrice);
    const branchCandidate = branchPrice;

    let promotionalPrice: number | undefined;
    let appliedPromotion: any = null;
    const prePromotionPrice = PricingTaxEngine.resolveUnitPrice({
      basePrice,
      costPrice: Number(variant.costPrice || product.buyingPrice || 0),
      branchPrice: branchCandidate,
      priceListPrice,
      bulkPrice,
      wholesalePrice,
      quantity: input.quantity,
    });

    if (customerPrice) {
      source = "CUSTOMER";
      bestTierPrice = Number(customerPrice.unitPrice);
      sourceId = customerPrice.id;
    } else if (promotions.length > 0) {
      const promotion = promotions[0];
      if (promotions.some((p: any) => p.stackable) && promotions.filter((p: any) => p.stackable).length > 1) {
        throw new Error("PROMOTION_STACKING_REQUIRES_EXPLICIT_ORDER");
      }
      if (promotion.kind === "PERCENTAGE") {
        promotionalPrice = Math.max(0, prePromotionPrice - (prePromotionPrice * Number(promotion.value) / 100));
      } else {
        promotionalPrice = Math.max(0, prePromotionPrice - Number(promotion.value));
      }
      bestTierPrice = promotionalPrice;
      source = "PROMOTION";
      sourceId = promotion.id;
      appliedPromotion = promotion;
    } else {
      bestTierPrice = prePromotionPrice;
      if (wholesalePrice !== undefined) {
        source = "WHOLESALE";
        sourceId = wholesaleTier?.id;
      } else if (bulkPrice !== undefined) {
        source = "BULK";
        sourceId = bulkTier?.id;
      } else if (branchCandidate !== undefined && Number(branchCandidate) > 0) {
        source = "BRANCH";
        sourceId = variant.id;
      } else if (priceListPrice !== undefined) {
        source = "PRICE_LIST";
        sourceId = priceListItem?.id;
      } else {
        source = "BASE";
        sourceId = product.id;
      }
    }

    if (!Number.isFinite(bestTierPrice) || bestTierPrice < 0) throw new Error("PRICING_RESOLUTION_INVALID");

    const requested = input.requestedUnitPrice;
    let overrideApplied = false;
    if (requested !== undefined && Math.abs(Number(requested) - bestTierPrice) > 0.005) {
      if (!canOverridePrice(ctx)) throw new Error("SALE_PRICE_AUTHORITY_VIOLATION");
      if (!input.priceOverrideReason) throw new Error("PRICE_OVERRIDE_REASON_REQUIRED");
      overrideApplied = true;
      bestTierPrice = Number(requested);
    }

    assertEffectiveDates(now);
    return {
      unitPrice: Math.round(bestTierPrice * 100) / 100,
      source,
      sourceId,
      productId: variant.productId,
      variantId: variant.id,
      customerPriceId: customerPrice?.id,
      priceListItemId: priceListItem?.id,
      pricingTierId: wholesaleTier?.id || bulkTier?.id,
      promotionId: appliedPromotion?.id,
      promotionalBasePrice: appliedPromotion ? Math.round(prePromotionPrice * 100) / 100 : undefined,
      overrideApplied,
      requestedUnitPrice: requested,
      overrideReason: input.priceOverrideReason,
    };
  }
}
