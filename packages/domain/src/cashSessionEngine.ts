export interface CashSessionState {
  id: string;
  openingCash: number;
  cashSalesTotal: number;
  cashRefundsTotal: number;
  cashExpensesTotal: number;
  actualCash?: number;
}

export class CashSessionEngine {
  /**
   * Calculates the exact expected cash drawer balance.
   * Expected = Opening Cash + Cash Sales - Cash Refunds - Cash Expenses
   */
  static calculateExpectedCash(state: CashSessionState): number {
    const expected =
      state.openingCash + state.cashSalesTotal - state.cashRefundsTotal - state.cashExpensesTotal;
    return Math.round(expected * 100) / 100;
  }

  /**
   * Calculates cash drawer variance upon session closure.
   * Variance = Actual Cash Count - Expected Cash
   */
  static calculateVariance(state: CashSessionState, actualCash: number): { expectedCash: number; actualCash: number; variance: number; isBalanced: boolean } {
    const expectedCash = this.calculateExpectedCash(state);
    const variance = Math.round((actualCash - expectedCash) * 100) / 100;
    return {
      expectedCash,
      actualCash,
      variance,
      isBalanced: variance === 0,
    };
  }
}