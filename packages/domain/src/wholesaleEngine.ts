import type {
  WholesaleProductTierRule,
  WholesaleQuantityTier,
} from "@kwakopos2/contracts";

export class WholesaleEngine {
  calculateUnitPrice(
    quantity: number,
    basePrice: number,
    tierRule?: WholesaleProductTierRule | null
  ): { unitPrice: number; discountPercent: number; appliedTier?: WholesaleQuantityTier } {
    if (!tierRule || tierRule.tiers.length === 0) {
      return { unitPrice: basePrice, discountPercent: 0 };
    }

    // Sort descending by minQuantity
    const sortedTiers = [...tierRule.tiers].sort((a, b) => b.minQuantity - a.minQuantity);
    const matchedTier = sortedTiers.find((t) => quantity >= t.minQuantity);

    if (matchedTier) {
      return {
        unitPrice: matchedTier.unitPrice,
        discountPercent: matchedTier.discountPercent,
        appliedTier: matchedTier,
      };
    }

    return { unitPrice: basePrice, discountPercent: 0 };
  }

  calculatePalletBreakdown(
    totalUnits: number,
    unitsPerCase = 12,
    casesPerPallet = 50
  ): { fullPallets: number; fullCases: number; looseUnits: number } {
    const unitsPerPallet = unitsPerCase * casesPerPallet;

    const fullPallets = Math.floor(totalUnits / unitsPerPallet);
    let rem = totalUnits % unitsPerPallet;

    const fullCases = Math.floor(rem / unitsPerCase);
    const looseUnits = rem % unitsPerCase;

    return {
      fullPallets,
      fullCases,
      looseUnits,
    };
  }
}
