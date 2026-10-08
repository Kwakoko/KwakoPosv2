import { describe, it, expect } from "vitest";
import { PricingTaxEngine } from "../../packages/domain/src/pricingTaxEngine.js";

describe("Pricing, Tax & Discount Engine — production lock", () => {
  it("enforces authoritative pricing precedence", () => {
    const resolved = PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000,
      priceListPrice: 1050,
      branchPrice: 1100,
      bulkPrice: 950,
      wholesalePrice: 900,
      promotionalPrice: 850,
      customerPrice: 800,
      costPrice: 600,
      quantity: 10,
    });
    expect(resolved).toBe(800);

    expect(PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000, priceListPrice: 1050, branchPrice: 1100, bulkPrice: 950, wholesalePrice: 900,
      promotionalPrice: 850, costPrice: 600, quantity: 10,
    })).toBe(850);

    expect(PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000, priceListPrice: 1050, branchPrice: 1100, bulkPrice: 950, wholesalePrice: 900,
      costPrice: 600, quantity: 10,
    })).toBe(900);

    expect(PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000, priceListPrice: 1050, branchPrice: 1100, bulkPrice: 950,
      costPrice: 600, quantity: 10,
    })).toBe(950);

    expect(PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000, priceListPrice: 1050, branchPrice: 1100,
      costPrice: 600, quantity: 1,
    })).toBe(1100);

    expect(PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000, priceListPrice: 1050,
      costPrice: 600, quantity: 1,
    })).toBe(1050);
  });

  it("permits an explicit zero-valued promotion price", () => {
    expect(PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000,
      promotionalPrice: 0,
      costPrice: 600,
      quantity: 1,
    })).toBe(0);
  });

  it("rejects invalid quantity and discount values instead of silently correcting them", () => {
    expect(() => PricingTaxEngine.resolveUnitPrice({
      basePrice: 1000,
      costPrice: 600,
      quantity: 0,
    })).toThrow("PRICING_QUANTITY_INVALID");

    expect(() => PricingTaxEngine.calculateDiscount(1000, 1, {
      type: "PERCENTAGE",
      value: 101,
    })).toThrow("DISCOUNT_PERCENT_EXCEEDS_100");

    expect(() => PricingTaxEngine.calculateDiscount(1000, 1, {
      type: "FIXED",
      value: -1,
    })).toThrow("DISCOUNT_VALUE_INVALID");
  });

  it("calculates percentage and fixed item discounts", () => {
    expect(PricingTaxEngine.calculateDiscount(1000, 2, { type: "PERCENTAGE", value: 10 })).toBe(200);
    expect(PricingTaxEngine.calculateDiscount(1000, 2, { type: "FIXED", value: 300 })).toBe(300);
  });

  it("calculates inclusive and exclusive VAT (18%)", () => {
    const exclusive = PricingTaxEngine.calculateTax(10000, { ratePct: 18, isInclusive: false });
    expect(exclusive.taxAmount).toBe(1800);
    expect(exclusive.grossAmount).toBe(11800);

    const inclusive = PricingTaxEngine.calculateTax(11800, { ratePct: 18, isInclusive: true });
    expect(inclusive.taxAmount).toBe(1800);
    expect(inclusive.netAmount).toBe(10000);
  });

  it("recalculates cart-discount tax interaction for inclusive VAT", () => {
    const sale = PricingTaxEngine.calculateSaleTotals(
      [{ lineTotal: 11800, totalCost: 6000, discountAmount: 0, taxAmount: 1800 }],
      1180,
      { ratePct: 18, isInclusive: true },
    );
    expect(sale.discountTotal).toBe(1180);
    expect(sale.grandTotal).toBe(10620);
    expect(sale.taxTotal).toBe(1620);
  });

  it("recalculates cart-discount tax interaction for exclusive VAT", () => {
    const sale = PricingTaxEngine.calculateSaleTotals(
      [{ lineTotal: 11800, totalCost: 6000, discountAmount: 0, taxAmount: 1800 }],
      1800,
      { ratePct: 18, isInclusive: false },
    );
    expect(sale.discountTotal).toBe(1800);
    expect(sale.taxTotal).toBe(1476);
    expect(sale.grandTotal).toBe(9676);
  });

  it("blocks discounts greater than the subtotal", () => {
    expect(() => PricingTaxEngine.calculateSaleTotals(
      [{ lineTotal: 1000, totalCost: 500, discountAmount: 0, taxAmount: 180 }],
      1000.01,
      { ratePct: 18, isInclusive: false },
    )).toThrow("CART_DISCOUNT_EXCEEDS_SUBTOTAL");
  });
});
