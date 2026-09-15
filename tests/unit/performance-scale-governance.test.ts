import { describe, expect, it } from "vitest";
import { KWAKOKO_PERFORMANCE_SCALE_GOVERNANCE as G } from "../../packages/config/src/performanceScaleGovernance.js";

describe("Kwakoko Performance & Global Scale Governance", () => {
  it("defines governed latency budgets", () => {
    expect(G.performanceBudgets.apiP95Ms).toBe(500);
    expect(G.performanceBudgets.posCheckoutP95Ms).toBe(400);
    expect(G.performanceBudgets.pwaLcpMs).toBe(2500);
  });
  it("defines explicit tenant capacity boundaries", () => {
    expect(G.capacityBudgets.maxTenantProducts).toBe(100000);
    expect(G.capacityBudgets.maxBranches).toBe(1000);
    expect(G.capacityBudgets.dailySyncEvents).toBe(250000);
  });
  it("requires the four governed workload profiles", () => {
    expect(G.workloadProfiles).toEqual(["BASELINE_1X", "MULTIPLIER_10X", "MULTIPLIER_50X", "STRESS_100X"]);
  });
  it("defines cross-region invariants", () => {
    expect(G.regionalInvariants.length).toBeGreaterThanOrEqual(5);
    expect(G.regionalInvariants.some((x) => /tenant data/i.test(x))).toBe(true);
  });
  it("requires performance evidence and delegated reliability governance", () => {
    expect(G.releaseGate.requiredEvidence.length).toBeGreaterThanOrEqual(6);
    expect(G.releaseGate.delegatedGates).toContain("production-reliability:verify");
  });
  it("is fail-closed and versioned", () => {
    expect(G.failClosed).toBe(true);
    expect(G.certificate).toBe("KWAKOKO-PERFORMANCE-SCALE-CERTIFICATE-v1.0");
  });
});
