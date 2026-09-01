import {
  TableMasterRecord,
  GuestTabRecord,
  RecipeIngredientItem,
  ShiftReconciliationRecord,
  BarLoungeFinancialSummary,
  BarTableStatus,
} from "@kwakopos2/contracts";

export class BarLoungeEngine {
  private validTableTransitions: Record<BarTableStatus, BarTableStatus[]> = {
    AVAILABLE: ["RESERVED", "SEATED"],
    RESERVED: ["SEATED", "AVAILABLE"],
    SEATED: ["ORDERING", "ACTIVE_TAB"],
    ORDERING: ["ACTIVE_TAB"],
    ACTIVE_TAB: ["PAYMENT", "CLOSED"],
    PAYMENT: ["CLOSED"],
    CLOSED: ["CLEANING"],
    CLEANING: ["AVAILABLE"],
  };

  public validateTableStatusTransition(currentStatus: BarTableStatus, newStatus: BarTableStatus): boolean {
    if (currentStatus === newStatus) return true;
    const allowed = this.validTableTransitions[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  public calculateRecipeConsumption(
    menuItemQuantitySold: number,
    recipe: RecipeIngredientItem[]
  ): Array<{ ingredientSku: string; totalConsumedQuantity: number; totalCostUsd: number }> {
    return recipe.map((ing) => {
      const totalConsumedQuantity = ing.portionQuantity * menuItemQuantitySold;
      const totalCostUsd = totalConsumedQuantity * ing.unitCostUsd;
      return {
        ingredientSku: ing.ingredientSku,
        totalConsumedQuantity: Math.round(totalConsumedQuantity * 100) / 100,
        totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      };
    });
  }

  public validateSplitBillsTotal(originalBillTotalUsd: number, splitBillAmountsUsd: number[]): boolean {
    const sumSplits = splitBillAmountsUsd.reduce((acc, amt) => acc + amt, 0);
    return Math.abs(sumSplits - originalBillTotalUsd) < 0.01;
  }

  public calculateShiftCashReconciliation(
    openingFloatUsd: number,
    cashSalesUsd: number,
    countedCashUsd: number
  ): { expectedCashUsd: number; varianceUsd: number } {
    const expectedCashUsd = openingFloatUsd + cashSalesUsd;
    const varianceUsd = countedCashUsd - expectedCashUsd;
    return {
      expectedCashUsd: Math.round(expectedCashUsd * 100) / 100,
      varianceUsd: Math.round(varianceUsd * 100) / 100,
    };
  }

  public calculateBarFinancialSummary(
    tabs: GuestTabRecord[],
    wastageCostUsd = 0
  ): BarLoungeFinancialSummary {
    const closedTabs = tabs.filter((t) => t.status === "CLOSED");
    const totalTabsCount = closedTabs.length;

    const totalBeverageRevenueUsd = closedTabs.reduce((acc, tab) => acc + tab.grandTotalUsd * 0.75, 0);
    const totalFoodRevenueUsd = closedTabs.reduce((acc, tab) => acc + tab.grandTotalUsd * 0.25, 0);
    const totalRevenueUsd = totalBeverageRevenueUsd + totalFoodRevenueUsd;

    const totalRecipeCogsUsd = totalRevenueUsd * 0.28;
    const grossMarginUsd = totalRevenueUsd - totalRecipeCogsUsd - wastageCostUsd;
    const grossMarginPct =
      totalRevenueUsd > 0 ? Math.round((grossMarginUsd / totalRevenueUsd) * 1000) / 10 : 0;

    return {
      totalTabsCount,
      totalBeverageRevenueUsd: Math.round(totalBeverageRevenueUsd * 100) / 100,
      totalFoodRevenueUsd: Math.round(totalFoodRevenueUsd * 100) / 100,
      totalRecipeCogsUsd: Math.round(totalRecipeCogsUsd * 100) / 100,
      grossMarginUsd: Math.round(grossMarginUsd * 100) / 100,
      grossMarginPct,
      totalWastageCostUsd: Math.round(wastageCostUsd * 100) / 100,
    };
  }
}
