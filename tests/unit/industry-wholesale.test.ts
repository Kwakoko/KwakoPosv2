import { describe, it, expect } from "vitest";
import { WholesaleEngine } from "@kwakopos2/domain";
import type { WholesaleProductTierRule } from "@kwakopos2/contracts";

describe("Industry Engine: Wholesale & Volume Distribution", () => {
  const engine = new WholesaleEngine();

  const sampleTierRule: WholesaleProductTierRule = {
    id: "rule-1",
    tenantId: "t1",
    variantId: "v1",
    minimumOrderQuantity: 10,
    unitsPerCase: 12,
    casesPerPallet: 50, // 600 units per pallet
    tiers: [
      { minQuantity: 100, unitPrice: 8500, discountPercent: 15 },
      { minQuantity: 50, unitPrice: 9000, discountPercent: 10 },
      { minQuantity: 10, unitPrice: 9500, discountPercent: 5 },
    ],
    createdAt: "",
    updatedAt: "",
  };

  it("calculates tiered volume pricing accurately", () => {
    // 5 units (below min tier) -> base price 10000
    const belowMin = engine.calculateUnitPrice(5, 10000, sampleTierRule);
    expect(belowMin.unitPrice).toBe(10000);
    expect(belowMin.discountPercent).toBe(0);

    // 25 units -> matches tier minQuantity: 10 -> 9500
    const midTier = engine.calculateUnitPrice(25, 10000, sampleTierRule);
    expect(midTier.unitPrice).toBe(9500);
    expect(midTier.discountPercent).toBe(5);

    // 120 units -> matches tier minQuantity: 100 -> 8500
    const highTier = engine.calculateUnitPrice(120, 10000, sampleTierRule);
    expect(highTier.unitPrice).toBe(8500);
    expect(highTier.discountPercent).toBe(15);
  });

  it("computes full pallet and case breakdown", () => {
    // 1450 units:
    // Pallet = 12 * 50 = 600 units
    // 1450 / 600 = 2 full pallets (1200 units), remainder = 250 units
    // 250 / 12 = 20 full cases (240 units), remainder = 10 loose units
    const breakdown = engine.calculatePalletBreakdown(1450, 12, 50);
    expect(breakdown.fullPallets).toBe(2);
    expect(breakdown.fullCases).toBe(20);
    expect(breakdown.looseUnits).toBe(10);
  });
});
