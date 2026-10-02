import { describe, it, expect } from "vitest";
import { getDashboardCardDefinitions } from "../../apps/web/src/services/dashboardCardRegistry.js";
import { ALL_MODULE_KEYS, MODULE_MANIFESTS } from "../../apps/web/src/modules/moduleRegistry.js";

describe("Dashboard Card Registry", () => {
  it("uses explicit module card keys and never carries baked KPI values", () => {
    for (const module of ALL_MODULE_KEYS) {
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


  it("resolves every module manifest card key to a registered card", () => {
    for (const module of ALL_MODULE_KEYS) {
      const declaredKeys = MODULE_MANIFESTS[module].dashboardCardKeys ?? [];
      const cards = getDashboardCardDefinitions(module);

      expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length);

      for (const key of declaredKeys) {
        expect(cards.some((card) => card.key === key)).toBe(true);
      }
    }
  });
