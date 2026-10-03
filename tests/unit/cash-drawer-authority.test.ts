import { describe, expect, it } from "vitest";
import { CashSessionEngine } from "@kwakopos2/domain";

describe("Cash Drawer P0/P1 authority equation", () => {
  it("includes cash-in, cash-out, safe drops and petty cash in expected cash", () => {
    const expected = CashSessionEngine.calculateExpectedCash({
      id: "cash-cert",
      openingCash: 100000,
      cashSalesTotal: 50000,
      cashRefundsTotal: 5000,
      cashExpensesTotal: 2000,
      cashInTotal: 10000,
      cashOutTotal: 7000,
      safeDropTotal: 20000,
    });
    expect(expected).toBe(126000);
  });
});
