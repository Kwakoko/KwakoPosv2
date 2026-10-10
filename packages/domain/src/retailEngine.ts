import { randomUUID } from "crypto";
import type {
  TenantContext,
  Product,
  ProductVariant,
  StockLedger,
  Sale,
  RetailModuleManifest,
  RetailSettings,
  RetailPromotion,
  RetailReplenishmentSuggestion,
  RetailAiRecommendation,
  RetailAuditEvent,
} from "@kwakopos2/contracts";

export class RetailEngine {
  getModuleManifest(): RetailModuleManifest {
    return {
      moduleId: "retail_operating_system",
      name: "KwakoPos Enterprise Retail Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedScales: ["SINGLE_STORE", "MULTI_BRANCH", "REGIONAL", "ENTERPRISE"],
      permissions: [
        "RETAIL_CATALOG_VIEW",
        "RETAIL_CATALOG_MANAGE",
        "RETAIL_VARIANT_MANAGE",
        "RETAIL_INVENTORY_VIEW",
        "RETAIL_INVENTORY_ADJUST",
        "RETAIL_POS_CHECKOUT",
        "RETAIL_POS_DISCOUNT_OVERRIDE",
        "RETAIL_PROMOTION_VIEW",
        "RETAIL_PROMOTION_MANAGE",
        "RETAIL_RETURN_PROCESS",
        "RETAIL_PURCHASE_MANAGE",
        "RETAIL_SUPPLIER_MANAGE",
        "RETAIL_CUSTOMER_CREDIT",
        "RETAIL_BRANCH_TRANSFER",
        "RETAIL_TILL_CLOSE",
        "RETAIL_AI_INSIGHTS_VIEW",
        "RETAIL_REPLENISHMENT_EXECUTE",
      ],
      navigationRoutes: [
        "/retail/pos",
        "/retail/catalog",
        "/retail/inventory",
        "/retail/purchasing",
        "/retail/customers",
        "/retail/suppliers",
        "/retail/cash-tills",
        "/retail/ai-insights",
        "/retail/reports",
      ],
      dashboardWidgetIds: [
        "widget_today_sales",
        "widget_gross_profit",
        "widget_low_stock_alerts",
        "widget_ai_replenishment",
        "widget_customer_credit",
        "widget_cash_variance",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): RetailSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      taxRatePct: 18.0,
      taxInclusivePricing: true,
      allowNegativeStock: false,
      requireReceiptForReturn: true,
      maxDiscountPctWithoutApproval: 15.0,
      skuPrefix: "RET-",
      barcodeFormat: "CODE128",
      stockValuationMethod: "FIFO",
      receiptHeader: "KwakoPos Retail Store",
      receiptFooter: "Thank you for shopping with us!",
    };
  }

  calculateStockLedgerBalance(
    openingStock: number,
    stockIn: number,
    stockOut: number,
    adjustments: number
  ): number {
    // Standard Inventory Balance Invariant: Opening + In - Out ± Adjustments = Current
    const current = openingStock + stockIn - stockOut + adjustments;
    if (isNaN(current)) {
      throw new Error("Invalid inventory calculation result");
    }
    return current;
  }

  calculateParentProductStockFromVariants(variants: ProductVariant[]): {
    totalStock: number;
    reservedStock: number;
    availableStock: number;
    lowStockVariantsCount: number;
  } {
    let totalStock = 0;
    let reservedStock = 0;
    let availableStock = 0;
    let lowStockVariantsCount = 0;

    for (const v of variants || []) {
      if (!v.isActive) continue;
      const stock = Number((v as any).inventoryQuantity ?? (v as any).stock ?? 0);
      const reserved = Number(v.reservedQuantity ?? 0);
      const reorder = Number(v.reorderLevel ?? 0);

      totalStock += stock;
      reservedStock += reserved;
      availableStock += Math.max(0, stock - reserved);
      if (stock <= reorder) lowStockVariantsCount++;
    }

    return {
      totalStock,
      reservedStock,
      availableStock,
      lowStockVariantsCount,
    };
  }

  getEffectiveVariantPrice(
    product: { buyingPrice?: number; sellingPrice?: number },
    variant: ProductVariant
  ): { effectiveBuyingPrice: number; effectiveSellingPrice: number } {
    const parentBuying = product.buyingPrice ?? 0;
    const parentSelling = product.sellingPrice ?? 0;
    const inheritBuying = variant.inheritBuyingPrice ?? true;
    const inheritSelling = variant.inheritSellingPrice ?? true;

    return {
      effectiveBuyingPrice: inheritBuying ? parentBuying : variant.costPrice ?? 0,
      effectiveSellingPrice: inheritSelling ? parentSelling : variant.price ?? 0,
    };
  }

  generateVariantCombinations(
    productName: string,
    baseSku: string,
    attributes: Array<{ name: string; values: string[] }>,
    defaultBuyingPrice: number = 0,
    defaultSellingPrice: number = 0
  ): Array<{
    name: string;
    sku: string;
    barcode: string;
    inheritBuyingPrice: boolean;
    inheritSellingPrice: boolean;
    costPrice: number;
    price: number;
    effectiveBuyingPrice: number;
    effectiveSellingPrice: number;
    attributes: Record<string, string>;
  }> {
    if (!attributes || attributes.length === 0) return [];

    const cartesian = (arrays: string[][]): string[][] => {
      return arrays.reduce<string[][]>(
        (acc, curr) => acc.flatMap((d) => curr.map((e) => [...d, e])),
        [[]]
      );
    };

    const valueArrays = attributes.map((a) => a.values);
    const combinations = cartesian(valueArrays);
    const cleanBaseSku = baseSku.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();

    return combinations.map((combo, idx) => {
      const attrMap: Record<string, string> = {};
      attributes.forEach((attr, i) => {
        attrMap[attr.name] = combo[i];
      });

      const comboStr = combo.join(" / ");
      const skuSuffix = combo
        .map((val) => val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3))
        .join("-");
      const sku = `${cleanBaseSku}-${skuSuffix}`;
      // High-entropy CODE128-compatible identifier; database uniqueness remains authoritative.
      const barcodeSeed = randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();

      return {
        name: `${productName} (${comboStr})`,
        sku,
        barcode: `BAR-${barcodeSeed}`,
        inheritBuyingPrice: true,
        inheritSellingPrice: true,
        costPrice: defaultBuyingPrice,
        price: defaultSellingPrice,
        effectiveBuyingPrice: defaultBuyingPrice,
        effectiveSellingPrice: defaultSellingPrice,
        attributes: attrMap,
      };
    });
  }

  generateSKU(prefix: string, productName: string, variantName?: string): string {
    const pClean = productName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
    const vClean = variantName ? "-" + variantName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3) : "";
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    return `${prefix}${pClean}${vClean}-${suffix}`;
  }

  generateBarcode(prefix: string, idSeed: string): string {
    const cleanSeed = idSeed.replace(/[^0-9]/g, "").slice(0, 8).padStart(8, "0");
    return `${prefix}-${cleanSeed}`;
  }

  evaluatePricingAndTaxes(
    basePrice: number,
    taxRatePct: number,
    isTaxInclusive: boolean,
    promotion?: RetailPromotion
  ): {
    originalPrice: number;
    discountAmount: number;
    taxableAmount: number;
    taxAmount: number;
    finalPrice: number;
  } {
    let priceAfterDiscount = basePrice;
    let discountAmount = 0;

    if (promotion && promotion.isActive) {
      if (promotion.type === "PERCENTAGE_DISCOUNT") {
        discountAmount = Math.round((basePrice * promotion.discountValue) / 100);
      } else if (promotion.type === "FIXED_AMOUNT_DISCOUNT") {
        discountAmount = Math.min(basePrice, promotion.discountValue);
      }
      priceAfterDiscount = Math.max(0, basePrice - discountAmount);
    }

    let taxableAmount = 0;
    let taxAmount = 0;

    if (isTaxInclusive) {
      taxableAmount = Math.round(priceAfterDiscount / (1 + taxRatePct / 100));
      taxAmount = priceAfterDiscount - taxableAmount;
    } else {
      taxableAmount = priceAfterDiscount;
      taxAmount = Math.round((taxableAmount * taxRatePct) / 100);
    }

    const finalPrice = isTaxInclusive ? priceAfterDiscount : priceAfterDiscount + taxAmount;

    return {
      originalPrice: basePrice,
      discountAmount,
      taxableAmount,
      taxAmount,
      finalPrice,
    };
  }

  calculatePOSCartTotals(
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      discountAmount?: number;
    }>,
    cartDiscountPct: number = 0,
    taxRatePct: number = 18.0,
    isTaxInclusive: boolean = true
  ): {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
    totalCost: number;
    grossProfit: number;
  } {
    let subtotal = 0;
    let lineDiscounts = 0;
    let totalCost = 0;

    for (const item of items) {
      const lineSub = item.quantity * item.unitPrice;
      const lineDisc = (item.discountAmount || 0) * item.quantity;
      subtotal += lineSub;
      lineDiscounts += lineDisc;
      totalCost += item.quantity * item.unitCost;
    }

    const totalBeforeCartDiscount = subtotal - lineDiscounts;
    const cartDiscountAmount = Math.round((totalBeforeCartDiscount * cartDiscountPct) / 100);
    const discountTotal = lineDiscounts + cartDiscountAmount;
    const netSales = subtotal - discountTotal;

    let taxTotal = 0;
    let grandTotal = 0;

    if (isTaxInclusive) {
      const taxable = Math.round(netSales / (1 + taxRatePct / 100));
      taxTotal = netSales - taxable;
      grandTotal = netSales;
    } else {
      taxTotal = Math.round((netSales * taxRatePct) / 100);
      grandTotal = netSales + taxTotal;
    }

    const grossProfit = netSales - totalCost;

    return {
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      totalCost,
      grossProfit,
    };
  }

  validateSaleReturn(
    originalSale: Sale,
    returnItems: Array<{ variantId: string; quantityReturned: number; refundUnitPrice: number }>,
    settings: RetailSettings
  ): {
    valid: boolean;
    error?: string;
    totalRefundAmount: number;
  } {
    if (settings.requireReceiptForReturn && !originalSale.saleNumber) {
      return { valid: false, error: "Original receipt number is required for returns", totalRefundAmount: 0 };
    }

    let totalRefund = 0;
    const lines = originalSale.lines || [];
    const requestedByVariant = new Map<string, number>();
    for (const rItem of returnItems) {
      const quantityReturned = Number(rItem.quantityReturned);
      const refundUnitPrice = Number(rItem.refundUnitPrice);
      if (!Number.isFinite(quantityReturned) || quantityReturned <= 0) return { valid: false, error: "Return quantity must be a finite positive number", totalRefundAmount: 0 };
      if (!Number.isFinite(refundUnitPrice) || refundUnitPrice < 0) return { valid: false, error: "Refund unit price must be a finite non-negative number", totalRefundAmount: 0 };
      const origLine = lines.find((line) => line.variantId === rItem.variantId);
      if (!origLine) return { valid: false, error: "Variant " + rItem.variantId + " was not part of original sale", totalRefundAmount: 0 };
      const cumulative = (requestedByVariant.get(rItem.variantId) || 0) + quantityReturned;
      if (cumulative > Number(origLine.quantity) + 0.000001) {
        return { valid: false, error: "Return quantity (" + cumulative + ") exceeds original sold quantity (" + origLine.quantity + ")", totalRefundAmount: 0 };
      }
      requestedByVariant.set(rItem.variantId, cumulative);
      totalRefund += quantityReturned * refundUnitPrice;
    }

    return {
      valid: true,
      totalRefundAmount: totalRefund,
    };
  }

  reconcileTillSessionCash(
    openingCash: number,
    cashSales: number,
    cashRefunds: number,
    cashExpenses: number,
    actualCash: number
  ): {
    expectedCash: number;
    variance: number;
    status: "BALANCED" | "SURPLUS" | "DEFICIT";
  } {
    const expectedCash = openingCash + cashSales - cashRefunds - cashExpenses;
    const variance = actualCash - expectedCash;
    let status: "BALANCED" | "SURPLUS" | "DEFICIT" = "BALANCED";

    if (variance > 0) status = "SURPLUS";
    if (variance < 0) status = "DEFICIT";

    return {
      expectedCash,
      variance,
      status,
    };
  }

  calculateReplenishmentSuggestions(
    items: Array<{ productId: string; variantId: string; productName: string; sku: string; currentStock: number; reorderLevel: number; costPrice: number; preferredSupplierId?: string }>,
    salesVelocityMap: Map<string, number>,
    leadTimeDays: number = 7,
    safetyStockDays: number = 3
  ): RetailReplenishmentSuggestion[] {
    const suggestions: RetailReplenishmentSuggestion[] = [];
    for (const item of items) {
      const signal = salesVelocityMap.get(item.variantId);
      const velocity = Number.isFinite(signal) ? Math.max(0, Number(signal)) : 0;
      const safetyStock = Math.ceil(velocity * safetyStockDays);
      const demandPoint = Math.ceil(velocity * leadTimeDays) + safetyStock;
      const reorderPoint = Math.max(0, Number(item.reorderLevel) || 0, demandPoint);
      if (reorderPoint <= 0 || Number(item.currentStock) > reorderPoint) continue;
      const target = Math.max(reorderPoint * 2, Math.ceil(velocity * (leadTimeDays + safetyStockDays)));
      const suggested = Math.max(0, Math.ceil(target - Number(item.currentStock)));
      if (suggested <= 0) continue;
      suggestions.push({
        productId: item.productId, variantId: item.variantId, productName: item.productName, sku: item.sku,
        currentStock: Number(item.currentStock), reorderLevel: Number(item.reorderLevel), salesVelocityPerDay: velocity,
        leadTimeDays, safetyStock, suggestedReorderQuantity: suggested, estimatedCostTzs: suggested * Number(item.costPrice),
        preferredSupplierId: item.preferredSupplierId,
      });
    }
    return suggestions;
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    inventory: Array<{ variantId: string; productName: string; currentStock: number; reorderLevel: number; costPrice: number }>,
    salesHistory: Array<{ variantId: string; sales30Days: number; discountGiven: number }>
  ): RetailAiRecommendation[] {
    const recommendations: RetailAiRecommendation[] = [];
    const now = new Date().toISOString();
    for (const inv of inventory) {
      const history = salesHistory.find((item) => item.variantId === inv.variantId);
      const sales = Math.max(0, Number(history?.sales30Days ?? 0));
      const velocity = sales / 30;
      const stock = Math.max(0, Number(inv.currentStock));
      const threshold = Math.max(0, Number(inv.reorderLevel));
      const stockValue = stock * Math.max(0, Number(inv.costPrice));
      if (threshold > 0 && stock <= threshold) {
        const demandKnown = sales > 0;
        const depletionDays = demandKnown ? Math.floor(stock / velocity) : null;
        recommendations.push({
          recommendationId: "REC-SO-" + randomUUID().slice(0, 6), tenantId: ctx.tenantId, branchId: ctx.branchId,
          category: "STOCKOUT_PREDICTION",
          observation: "Stock for '" + inv.productName + "' is " + stock + " units against reorder threshold " + threshold + ".",
          evidence: demandKnown ? sales + " net units sold in 30 days (" + velocity.toFixed(2) + " units/day); estimated stock cover is " + depletionDays + " days."
            : "No net sales were recorded in the last 30 days. A demand-based depletion forecast is unavailable.",
          recommendation: demandKnown ? "Review replenishment against validated lead time and supplier availability."
            : "Verify item demand, configured reorder policy, and stock count before replenishing.",
          expectedImpact: demandKnown ? "Stockout risk is present. Current at-cost inventory is " + stockValue.toLocaleString() + " TZS; lost revenue is not projected without validated pricing and demand."
            : "Current at-cost inventory is " + stockValue.toLocaleString() + " TZS; no lost-revenue estimate is made without demand evidence.",
          confidenceScore: demandKnown ? 70 : 35, createdAt: now,
        });
      }
      if (threshold > 0 && stock > threshold * 4 && sales < 3) {
        recommendations.push({
          recommendationId: "REC-DS-" + randomUUID().slice(0, 6), tenantId: ctx.tenantId, branchId: ctx.branchId,
          category: "SLOW_MOVING_DEAD_STOCK",
          observation: "Stock for '" + inv.productName + "' is " + stock + " units, more than four times its configured reorder threshold.",
          evidence: sales + " net units sold in 30 days. Current stock at cost is " + stockValue.toLocaleString() + " TZS.",
          recommendation: "Review stock count, item status, and supplier return or markdown options before repricing.",
          expectedImpact: "Up to " + stockValue.toLocaleString() + " TZS at cost is tied up in this stock position; recoverable value depends on disposition.",
          confidenceScore: sales === 0 ? 55 : 65, createdAt: now,
        });
      }
    }
    return recommendations;
  }

  createAuditEvent(
    ctx: TenantContext,
    action: string,
    entityType: string,
    entityId: string,
    beforeState?: Record<string, any>,
    afterState?: Record<string, any>,
    reason?: string
  ): RetailAuditEvent {
    return {
      eventId: `AUDIT-${randomUUID()}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      userId: ctx.userId,
      deviceId: String((ctx as any).deviceId || ctx.userId || "UNKNOWN_DEVICE"),
      action,
      entityType,
      entityId,
      beforeState,
      afterState,
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  assertRetailInvariants(
    products: Product[],
    variants: ProductVariant[],
    ledgers: StockLedger[],
    sales: Sale[]
  ): void {
    // 1. Orphan Variant Check
    const pIds = new Set(products.map((p) => p.id));
    for (const v of variants) {
      if (!pIds.has(v.productId)) {
        throw new Error(`Orphan variant breach! Variant ${v.id} has no valid parent product.`);
      }
    }

    // 2. SKU and non-empty barcode uniqueness within the tenant/branch scope.
    const skus = new Set<string>();
    const barcodes = new Set<string>();
    for (const v of variants) {
      if (skus.has(v.sku)) {
        throw new Error(`Duplicate SKU breach! SKU ${v.sku} is duplicated.`);
      }
      skus.add(v.sku);
      const barcode = String(v.barcode ?? "").trim();
      if (barcode) {
        const scopedBarcode = `${v.tenantId}:${v.branchId}:${barcode.toUpperCase()}`;
        if (barcodes.has(scopedBarcode)) {
          throw new Error(`Duplicate barcode breach! Barcode ${barcode} is duplicated within its tenant/branch.`);
        }
        barcodes.add(scopedBarcode);
      }
    }

    // 3. Stock Ledger Immutability Check
    for (const l of ledgers) {
      if (l.quantity === undefined || isNaN(l.quantity)) {
        throw new Error(`Invalid stock ledger entry ${l.id}: NaN quantity.`);
      }
    }
  }
}

export const globalRetailEngine = new RetailEngine();
