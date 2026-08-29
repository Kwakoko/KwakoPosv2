import {
  UnitConversionRule,
  CustomerCreditAccount,
  WholesalePricingTier,
  SalesOrderRecord,
  WholesaleFinancialSummary,
} from "@kwakopos2/contracts";

export class WholesaleEngine {
  /**
   * Converts unit quantities deterministically based on product unit conversion rules (e.g. 1 Carton = 24 Pieces).
   */
  public convertUnits(quantity: number, conversionRule: UnitConversionRule): number {
    return Math.round(quantity * conversionRule.conversionFactor * 1000) / 1000;
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
