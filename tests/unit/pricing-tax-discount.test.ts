import { describe, it, expect } from "vitest";
import { PricingTaxEngine } from "../../packages/domain/src/pricingTaxEngine.js";

describe("Pricing, Tax & Discount Engine", () => {
  it("resolves pricing precedence: Customer Price > Promo > Branch > Base", () => {
    // 1. Base price fallback
    expect(PricingTaxEngine.resolveUnitPrice({ basePrice: 1000, costPrice: 600, quantity: 1 })).toBe(1000);

    // 2. Branch price overrides base
    expect(
      PricingTaxEngine.resolveUnitPrice({
        basePrice: 1000,
        branchPrice: 1200,
        costPrice: 600,
        quantity: 1,
      })
    ).toBe(1200);

    // 3. Promo overrides branch
    expect(
      PricingTaxEngine.resolveUnitPrice({
        basePrice: 1000,
        branchPrice: 1200,
        promotionalPrice: 900,
        costPrice: 600,
        quantity: 1,
      })
    ).toBe(900);

    // 4. Customer price overrides all
    expect(
      PricingTaxEngine.resolveUnitPrice({
        basePrice: 1000,
        branchPrice: 1200,
        promotionalPrice: 900,
        customerPrice: 850,
        costPrice: 600,
        quantity: 1,
      })
    ).toBe(850);
  });

  it("calculates percentage and fixed item discounts", () => {
    expect(PricingTaxEngine.calculateDiscount(1000, 2, { type: "PERCENTAGE", value: 10 })).toBe(200);
    expect(PricingTaxEngine.calculateDiscount(1000, 2, { type: "FIXED", value: 300 })).toBe(300);
  });

  it("calculates inclusive and exclusive VAT (18%)", () => {
    // VAT Exclusive on 10,000 TZS -> Tax = 1,800, Gross = 11,800
    const exclusive = PricingTaxEngine.calculateTax(10000, { ratePct: 18, isInclusive: false });
    expect(exclusive.taxAmount).toBe(1800);
    expect(exclusive.grossAmount).toBe(11800);

    // VAT Inclusive on 11,800 TZS -> Tax = 1,800, Net = 10,000
    const inclusive = PricingTaxEngine.calculateTax(11800, { ratePct: 18, isInclusive: true });
    expect(inclusive.taxAmount).toBe(1800);
    expect(inclusive.netAmount).toBe(10000);
  });

  it("calculates complete sale totals and gross profit", () => {
    const lines = [
      { lineTotal: 10000, totalCost: 6000, discountAmount: 500, taxAmount: 1800 },
      { lineTotal: 5000, totalCost: 3000, discountAmount: 0, taxAmount: 900 },
    ];

    const sale = PricingTaxEngine.calculateSaleTotals(lines, 1000);
    expect(sale.subtotal).toBe(15000);
    expect(sale.discountTotal).toBe(1500); // 500 + 1000 cart discount
    expect(sale.grandTotal).toBe(14000); // 15000 - 1000
    expect(sale.totalCost).toBe(9000); // 6000 + 3000
    expect(sale.grossProfit).toBe(5000); // 14000 - 9000
  });
});