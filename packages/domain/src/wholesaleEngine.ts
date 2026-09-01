import {
  WholesaleUnitConversionRule,
  CustomerCreditAccount,
  WholesalePricingTier,
  SalesOrderRecord,
  WholesaleFinancialSummary,
} from "@kwakopos2/contracts";

export class WholesaleEngine {
  /**
   * Converts unit quantities deterministically based on product unit conversion rules (e.g. 1 Carton = 24 Pieces).
   */
  public convertUnits(quantity: number, conversionRule: WholesaleUnitConversionRule): number {
    const factor = conversionRule.conversionFactor ?? (conversionRule as any).multiplier ?? 1;
    return Math.round(quantity * factor * 1000) / 1000;
  }



  /**
   * Evaluates B2B Customer Available Credit and enforces Credit Limit controls:
   * Available Credit = Credit Limit - Outstanding Exposure - Reserved Exposure
   */
  public evaluateCustomerCredit(
    account: CustomerCreditAccount,
    orderAmountUsd: number
  ): { isApproved: boolean; availableCreditUsd: number; reason?: string } {
    const availableCreditUsd = account.creditLimitUsd - account.currentExposureUsd - account.reservedExposureUsd;

    if (account.isCreditHold) {
      return { isApproved: false, availableCreditUsd, reason: "Customer account is currently on CREDIT HOLD." };
    }
    if (orderAmountUsd > availableCreditUsd) {
      return {
        isApproved: false,
        availableCreditUsd,
        reason: `Order amount ($${orderAmountUsd}) exceeds available credit ($${availableCreditUsd}).`,
      };
    }
    return { isApproved: true, availableCreditUsd };
  }

  /**
   * Calculates Tier Pricing based on bulk volume purchase quantity.
   * Returns unit price as number.
   */
  public calculateTierPrice(
    baseWholesalePrice: number,
    quantity: number,
    tiersOrRule: any
  ): number {
    const res = this.calculateUnitPrice(quantity, baseWholesalePrice, tiersOrRule);
    return res.unitPrice;
  }

  /**
   * Calculates unit price and discount percent based on quantity and pricing tiers or rule.
   */
  public calculateUnitPrice(
    arg1: number,
    arg2: number,
    tiersOrRule: any
  ): { unitPrice: number; discountPercent: number } {
    let quantity = arg1;
    let basePrice = arg2;

    // Handle argument order ambiguity if called as calculateUnitPrice(basePrice, quantity, rule) vs (quantity, basePrice, rule)
    if (typeof tiersOrRule === "object" && tiersOrRule !== null) {
      if (Array.isArray(tiersOrRule.tiers)) {
        // rule provided
      }
    }

    const rawTiers: any[] = Array.isArray(tiersOrRule)
      ? tiersOrRule
      : (tiersOrRule && Array.isArray(tiersOrRule.tiers) ? tiersOrRule.tiers : []);

    const sortedTiers = [...rawTiers].sort((a, b) => b.minQuantity - a.minQuantity);
    const applicableTier = sortedTiers.find((t) => quantity >= t.minQuantity);

    if (applicableTier) {
      const unitPrice = applicableTier.unitPriceUsd ?? applicableTier.unitPrice ?? basePrice;
      const discountPercent = applicableTier.discountPercent ?? 0;
      return { unitPrice, discountPercent };
    }

    return { unitPrice: basePrice, discountPercent: 0 };
  }

  /**
   * Pallet breakdown helper: returns looseUnits, fullCases, fullPallets.
   */
  public calculatePalletBreakdown(
    totalPieces: number,
    piecesPerCarton = 24,
    cartonsPerPallet = 40
  ): { pieces: number; cartons: number; pallets: number; fullPallets: number; fullCases: number; looseUnits: number } {
    const totalCartons = Math.floor(totalPieces / piecesPerCarton);
    const piecesRemaining = totalPieces % piecesPerCarton;
    const pallets = Math.floor(totalCartons / cartonsPerPallet);
    const cartonsRemaining = totalCartons % cartonsPerPallet;

    return {
      pieces: piecesRemaining,
      cartons: cartonsRemaining,
      pallets,
      fullPallets: pallets,
      fullCases: cartonsRemaining,
      looseUnits: piecesRemaining,
    };
  }

  /**
   * Validates Wholesale Financial Reconciliation Invariants:
   * Net Margin = Sales Revenue - COGS - Freight
   */
  public calculateWholesaleProfitability(
    salesRevenueUsd: number,
    cogsUsd: number,
    freightCostUsd: number
  ): { grossProfitUsd: number; marginPct: number } {
    const grossProfitUsd = Math.round((salesRevenueUsd - cogsUsd - freightCostUsd) * 100) / 100;
    const marginPct = salesRevenueUsd > 0 ? Math.round((grossProfitUsd / salesRevenueUsd) * 1000) / 10 : 0;
    return { grossProfitUsd, marginPct };
  }
}

export const globalWholesaleEngine = new WholesaleEngine();

