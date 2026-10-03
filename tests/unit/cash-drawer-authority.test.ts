import { describe, expect, it } from "vitest";
import { CashSessionEngine } from "@kwakopos2/domain";

describe("Cash Drawer P0/P1 authority", () => {
  it("uses the complete immutable reconciliation equation", () => {
    expect(CashSessionEngine.calculateExpectedCash({
      id: "cash-cert", openingCash: 100000, cashSalesTotal: 50000,
      cashRefundsTotal: 5000, cashExpensesTotal: 2000,
      cashInTotal: 10000, cashOutTotal: 7000, safeDropTotal: 20000,
    })).toBe(126000);
  });
});
