export interface CashSessionState {
  id: string;
  openingCash: number;
  cashSalesTotal: number;
  cashRefundsTotal: number;
  cashExpensesTotal: number;
  cashInTotal?: number;
  cashOutTotal?: number;
  safeDropTotal?: number;
  actualCash?: number;
}

export class CashSessionEngine {
  /**
   * Calculates the exact expected cash drawer balance.
   * Expected = Opening Cash + Cash Sales + Cash In - Cash Refunds - Cash Expenses - Cash Out - Safe Drops
   */
  static calculateExpectedCash(state: CashSessionState): number {
    const expected =
      Number(state.openingCash ?? 0) +
      Number(state.cashSalesTotal ?? 0) +
      Number(state.cashInTotal ?? 0) -
      Number(state.cashRefundsTotal ?? 0) -
      Number(state.cashExpensesTotal ?? 0) -
      Number(state.cashOutTotal ?? 0) -
      Number(state.safeDropTotal ?? 0);
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