import type { Sale, Expense, Branch, TenantContext } from "@kwakopos2/contracts";

export interface BranchProfitabilityScorecard {
  branchId: string;
  branchName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingExpenses: number;
  netProfit: number;
  netMarginPct: number;
  salesCount: number;
  averageOrderValue: number;
}

export class ProfitabilityEngine {
  /**
   * Generates Branch-by-Branch Profitability Scorecard.
   */
  static generateBranchScorecard(
    branch: { id: string; name: string },
    sales: Sale[],
    expenses: Expense[]
  ): BranchProfitabilityScorecard {
    const branchSales = sales.filter((s) => s.branchId === branch.id && s.status === "COMPLETED");
    const branchExpenses = expenses.filter((e) => e.branchId === branch.id);

    const revenue = branchSales.reduce((sum, s) => sum + Number(s.grandTotal), 0);
    const cogs = branchSales.reduce((sum, s) => sum + Number(s.totalCost || 0), 0);
    const grossProfit = revenue - cogs;
    const grossMarginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;

    const operatingExpenses = branchExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const netProfit = grossProfit - operatingExpenses;
    const netMarginPct = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0;

    const salesCount = branchSales.length;
    const averageOrderValue = salesCount > 0 ? Math.round((revenue / salesCount) * 100) / 100 : 0;

    return {
      branchId: branch.id,
      branchName: branch.name,
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMarginPct,
      operatingExpenses: Math.round(operatingExpenses * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      netMarginPct,
      salesCount,
      averageOrderValue,
    };
  }
}
