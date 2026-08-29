import { describe, it, expect } from "vitest";
import { TelecomEngine } from "@kwakopos2/domain";
import { runTelecomCertification } from "../../scripts/certification/telecom-certification-engine.js";


describe("Advanced Telecom & Technical Services Engine Tests", () => {
  const engine = new TelecomEngine();

  it("should validate technical asset lifecycle state transitions correctly", () => {
    expect(engine.validateAssetLifecycleTransition("IN_STOCK", "INSTALLED")).toBe(true);
    expect(engine.validateAssetLifecycleTransition("IN_STOCK", "RETIRED")).toBe(false);
  });

  it("should validate fiber OTDR loss test thresholds", () => {
    expect(engine.validateFiberOtdrTest(0.28, 0.5)).toBe(true);
    expect(engine.validateFiberOtdrTest(0.72, 0.5)).toBe(false);
  });

  it("should evaluate SLA breach metrics accurately", () => {
    expect(engine.evaluateSlaBreach(3, 2, 3, 4)).toBe(true); // response breached
    expect(engine.evaluateSlaBreach(1, 2, 2, 4)).toBe(false); // compliant
  });

  it("should reconcile site material balances deterministically", () => {
    const bal = engine.calculateSiteMaterialBalance(50, 30, 15);
    expect(bal).toBe(5);
  });

  it("should pass 100% of the 67-Pillar Telecom certification campaign", () => {
    const cert = runTelecomCertification();
    expect(cert.totalPillars).toBe(67);
    expect(cert.passedPillars).toBe(67);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
