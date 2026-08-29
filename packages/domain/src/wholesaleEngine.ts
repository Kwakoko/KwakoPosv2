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
   */
  public calculateTierPrice(
    baseWholesalePrice: number,
    quantity: number,
    tiers: WholesalePricingTier[]
  ): number {
    const sortedTiers = [...tiers].sort((a, b) => b.minQuantity - a.minQuantity);
    const applicableTier = sortedTiers.find((t) => quantity >= t.minQuantity);
    return applicableTier ? applicableTier.unitPriceUsd : baseWholesalePrice;
  }

  /**
   * Alias for calculateTierPrice for backward compatibility.
   */
  public calculateUnitPrice(
    baseWholesalePrice: number,
    quantity: number,
    tiers: WholesalePricingTier[]
  ): number {
    return this.calculateTierPrice(baseWholesalePrice, quantity, tiers);
  }

  /**
   * Pallet breakdown helper: returns pieces, cartons, pallets.
   */
  public calculatePalletBreakdown(
    totalPieces: number,
    piecesPerCarton = 24,
    cartonsPerPallet = 40
  ): { pieces: number; cartons: number; pallets: number } {
    const totalCartons = Math.floor(totalPieces / piecesPerCarton);
    const piecesRemaining = totalPieces % piecesPerCarton;
    const pallets = Math.floor(totalCartons / cartonsPerPallet);
    const cartonsRemaining = totalCartons % cartonsPerPallet;

    return {
      pieces: piecesRemaining,
      cartons: cartonsRemaining,
      pallets,
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

