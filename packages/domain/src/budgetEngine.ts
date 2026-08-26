import type { Budget, BudgetLine, Expense, TenantContext } from "@kwakopos2/contracts";

export interface BudgetVarianceSummary {
  budgetId: string;
  budgetName: string;
  totalBudgeted: number;
  totalActual: number;
  totalVariance: number;
  variancePercentage: number;
  isOverBudget: boolean;
  lineDetails: {
    accountId: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePct: number;
    isOverBudget: boolean;
  }[];
}

export class BudgetEngine {
  /**
   * Compares budgeted lines against actual expenses or journal amounts.
   */
  static calculateBudgetVariance(
    budget: Budget,
    lines: BudgetLine[],
    actualExpenseMap: Map<string, number> // accountId -> actual amount spent
  ): BudgetVarianceSummary {
    let totalBudgeted = 0;
    let totalActual = 0;

    const lineDetails = lines.map((l) => {
      const budgeted = Number(l.budgetedAmount) || 0;
      const actual = actualExpenseMap.get(l.accountId) || Number(l.actualAmount) || 0;
      const variance = budgeted - actual; // Positive = Under budget (Good), Negative = Over budget (Bad)
      const variancePct = budgeted > 0 ? Math.round(((actual - budgeted) / budgeted) * 10000) / 100 : 0;

      totalBudgeted += budgeted;
      totalActual += actual;

      return {
        accountId: l.accountId,
        budgeted: Math.round(budgeted * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variancePct,
        isOverBudget: actual > budgeted,
      };
    });

    const totalVariance = totalBudgeted - totalActual;
    const variancePercentage =
      totalBudgeted > 0 ? Math.round(((totalActual - totalBudgeted) / totalBudgeted) * 10000) / 100 : 0;

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      totalBudgeted: Math.round(totalBudgeted * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance: Math.round(totalVariance * 100) / 100,
      variancePercentage,
      isOverBudget: totalActual > totalBudgeted,
      lineDetails,
    };
  }
}
