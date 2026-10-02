import { describe, it, expect } from "vitest";
import { getDashboardCardDefinitions } from "../../apps/web/src/services/dashboardCardRegistry.js";

describe("Dashboard Card Registry", () => {
  it("uses explicit module card keys and never carries baked KPI values", () => {
    const modules = ["Retail", "Restaurant", "SACCO", "Pharmacy", "Poultry", "BusinessConsultant"] as const;

    for (const module of modules) {
      const cards = getDashboardCardDefinitions(module);
      expect(cards.length).toBeGreaterThan(0);

      for (const card of cards) {
        expect(card.kpiKey).toBeTruthy();
        expect(card).not.toHaveProperty("value");
        expect(card).not.toHaveProperty("trend");
        expect(card).not.toHaveProperty("trendLabel");
      }
    }
  });

  it("does not invent SACCO interest or poultry production figures", () => {
    const sacco = getDashboardCardDefinitions("SACCO");
    const poultry = getDashboardCardDefinitions("Poultry");

    expect(sacco.find((card) => card.kpiKey === "SaccoInterestEarned")?.format).toBe("currency");
    expect(poultry.find((card) => card.kpiKey === "PoultryEggsToday")?.format).toBe("count");
  });
});
