export interface PricingContext {
  basePrice: number;
  costPrice: number;
  branchPrice?: number;
  priceListPrice?: number;
  bulkPrice?: number;
  wholesalePrice?: number;
  customerPrice?: number;
  promotionalPrice?: number;
  quantity: number;
}

export interface TaxConfig {
  ratePct: number; // e.g. 18 for 18% VAT
  isInclusive: boolean;
  isExempt?: boolean;
}

export interface DiscountRule {
  type: "PERCENTAGE" | "FIXED";
  value: number; // e.g. 10 for 10% or 500 for 500 TZS fixed
}

export class PricingTaxEngine {
  /**
   * Deterministic pricing precedence:
   * 1. Customer-Specific Price (highest precedence)
   * 2. Promotional Price
   * 3. Branch Price
   * 4. Base Variant Price (fallback)
   */
  static resolveUnitPrice(ctx: PricingContext): number {
    const candidates: Array<[string, number | undefined]> = [
      ["customer", ctx.customerPrice],
      ["promotion", ctx.promotionalPrice],
      ["wholesale", ctx.wholesalePrice],
      ["bulk", ctx.bulkPrice],
      ["branch", ctx.branchPrice],
      ["price_list", ctx.priceListPrice],
      ["base", ctx.basePrice],
    ];
    if (!Number.isFinite(ctx.quantity) || ctx.quantity <= 0) {
      throw new Error("PRICING_QUANTITY_INVALID");
    }
    for (const [, raw] of candidates) {
      if (raw === undefined) continue;
      if (!Number.isFinite(raw) || raw < 0) throw new Error("PRICING_VALUE_INVALID");
      return Math.round(raw * 100) / 100;
    }
    if (!Number.isFinite(ctx.basePrice) || ctx.basePrice < 0) throw new Error("BASE_PRICE_INVALID");
    return Math.round(ctx.basePrice * 100) / 100;
  }

  /**
   * Calculates line discount amount.
   */
  static calculateDiscount(unitPrice: number, quantity: number, discount?: DiscountRule): number {
    if (!discount) return 0;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("DISCOUNT_UNIT_PRICE_INVALID");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("DISCOUNT_QUANTITY_INVALID");
    if (!Number.isFinite(discount.value) || discount.value < 0) throw new Error("DISCOUNT_VALUE_INVALID");
    if (discount.value === 0) return 0;
    const grossTotal = unitPrice * quantity;
    if (discount.type === "PERCENTAGE") {
      if (discount.value > 100) throw new Error("DISCOUNT_PERCENT_EXCEEDS_100");
      return Math.min(grossTotal, (grossTotal * discount.value) / 100);
    }
    return Math.min(grossTotal, discount.value);
  }

  /**
   * Calculates tax (VAT) according to inclusive vs exclusive classification.
   */
  static calculateTax(taxableAmount: number, taxConfig: TaxConfig): { taxAmount: number; netAmount: number; grossAmount: number } {
    if (!Number.isFinite(taxableAmount) || taxableAmount < 0) throw new Error("TAXABLE_AMOUNT_INVALID");
    if (!Number.isFinite(taxConfig.ratePct) || taxConfig.ratePct < 0 || taxConfig.ratePct > 100) throw new Error("TAX_RATE_INVALID");
    if (taxConfig.isExempt || taxConfig.ratePct === 0) {
      return { taxAmount: 0, netAmount: taxableAmount, grossAmount: taxableAmount };
    }

    if (taxConfig.isInclusive) {
      // VAT inclusive: Gross is taxableAmount, Tax = Gross - (Gross / (1 + rate / 100))
      const net = taxableAmount / (1 + taxConfig.ratePct / 100);
      const tax = taxableAmount - net;
      return {
        taxAmount: Math.round(tax * 100) / 100,
        netAmount: Math.round(net * 100) / 100,
        grossAmount: taxableAmount,
      };
    } else {
      // VAT exclusive: Net is taxableAmount, Tax = Net * (rate / 100)
      const tax = (taxableAmount * taxConfig.ratePct) / 100;
      const gross = taxableAmount + tax;
      return {
        taxAmount: Math.round(tax * 100) / 100,
        netAmount: taxableAmount,
        grossAmount: Math.round(gross * 100) / 100,
      };
    }
  }

  /**
   * Calculates line item totals: subtotal, discount, tax, total, cost, and gross profit.
   */
  static calculateLineItem(item: {
    unitPrice: number;
    unitCost: number;
    quantity: number;
    discount?: DiscountRule;
    taxConfig?: TaxConfig;
  }) {
    const rawUnitPrice = item.unitPrice;
    const quantity = item.quantity;
    const discountAmount = this.calculateDiscount(rawUnitPrice, quantity, item.discount);
    const subtotal = rawUnitPrice * quantity - discountAmount;

    const defaultTax: TaxConfig = item.taxConfig || { ratePct: 0, isInclusive: true };
    const { taxAmount, grossAmount } = this.calculateTax(subtotal, defaultTax);

    const totalCost = item.unitCost * quantity;
    const grossProfit = grossAmount - totalCost;

    return {
      unitPrice: rawUnitPrice,
      unitCost: item.unitCost,
      quantity,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount,
      lineTotal: grossAmount,
      totalCost: Math.round(totalCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
    };
  }

  /**
   * Calculates overall sale cart totals and profit.
   */
  static calculateSaleTotals(
    lines: { lineTotal: number; totalCost: number; discountAmount: number; taxAmount: number }[],
    cartDiscount = 0,
    taxConfig?: TaxConfig,
  ) {
    if (!Number.isFinite(cartDiscount) || cartDiscount < 0) throw new Error("CART_DISCOUNT_INVALID");
    const linesTotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
    const linesCost = lines.reduce((acc, l) => acc + l.totalCost, 0);
    const linesDiscount = lines.reduce((acc, l) => acc + l.discountAmount, 0);
    const lineTaxTotal = lines.reduce((acc, l) => acc + l.taxAmount, 0);
    if (cartDiscount > linesTotal + 0.005) throw new Error("CART_DISCOUNT_EXCEEDS_SUBTOTAL");

    let taxTotal = lineTaxTotal;
    let grandTotal = Math.max(0, linesTotal - cartDiscount);
    if (taxConfig && !taxConfig.isExempt && taxConfig.ratePct > 0 && cartDiscount > 0) {
      if (taxConfig.isInclusive) {
        const grossAfterDiscount = Math.max(0, linesTotal - cartDiscount);
        const netAfterDiscount = grossAfterDiscount / (1 + taxConfig.ratePct / 100);
        taxTotal = Math.round((grossAfterDiscount - netAfterDiscount) * 100) / 100;
        grandTotal = Math.round(grossAfterDiscount * 100) / 100;
      } else {
        const netBeforeDiscount = Math.max(0, linesTotal - lineTaxTotal);
        const netAfterDiscount = Math.max(0, netBeforeDiscount - cartDiscount);
        taxTotal = Math.round((netAfterDiscount * taxConfig.ratePct) / 100 * 100) / 100;
        grandTotal = Math.round((netAfterDiscount + taxTotal) * 100) / 100;
      }
    }

    const totalDiscount = linesDiscount + cartDiscount;
    const grossProfit = grandTotal - linesCost;

    return {
      subtotal: Math.round(linesTotal * 100) / 100,
      discountTotal: Math.round(totalDiscount * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalCost: Math.round(linesCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
    };
  }
}