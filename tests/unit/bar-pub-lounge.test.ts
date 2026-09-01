import { describe, it, expect } from "vitest";
import { BarLoungeEngine } from "@kwakopos2/domain";
import { runBarLoungeCertification } from "../../scripts/certification/bar-lounge-certification-engine.js";

describe("Advanced Bar / Pub / Lounge Management Engine Tests", () => {
  const engine = new BarLoungeEngine();

  it("should validate table status state machine transitions correctly", () => {
    expect(engine.validateTableStatusTransition("AVAILABLE", "SEATED")).toBe(true);
    expect(engine.validateTableStatusTransition("AVAILABLE", "PAYMENT")).toBe(false);
  });

  it("should calculate recipe ingredient consumption deterministically", () => {
    const recipe = [
      { ingredientSku: "VODKA-01", ingredientName: "Vodka", portionQuantity: 45, unitOfMeasure: "ml", unitCostUsd: 0.04 },
      { ingredientSku: "TONIC-01", ingredientName: "Tonic", portionQuantity: 150, unitOfMeasure: "ml", unitCostUsd: 0.01 },
    ];
    const consumed = engine.calculateRecipeConsumption(4, recipe);
    expect(consumed[0].totalConsumedQuantity).toBe(180); // 45 * 4
    expect(consumed[1].totalConsumedQuantity).toBe(600); // 150 * 4
  });

  it("should validate split bill total reconciliation", () => {
    expect(engine.validateSplitBillsTotal(150, [50, 50, 50])).toBe(true);
    expect(engine.validateSplitBillsTotal(150, [50, 50, 40])).toBe(false);
  });

  it("should calculate shift cash reconciliation and variance correctly", () => {
    const shift = engine.calculateShiftCashReconciliation(200, 800, 980);
    expect(shift.expectedCashUsd).toBe(1000);
    expect(shift.varianceUsd).toBe(-20);
  });

  it("should pass 100% of the 59-Pillar Bar / Pub / Lounge certification campaign", () => {
    const cert = runBarLoungeCertification();
    expect(cert.totalPillars).toBe(59);
    expect(cert.passedPillars).toBe(59);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
