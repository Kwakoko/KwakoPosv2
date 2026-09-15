import { describe, expect, it } from "vitest";
import { KWAKOKO_PRODUCTION_RELIABILITY_GOVERNANCE as G } from "../../packages/config/src/productionReliabilityGovernance.js";
import { globalSloEvaluator, globalSyncMonitor, globalRegressionAnalyzer } from "@kwakopos2/observability";

describe("Kwakoko Production Reliability & Observability Governance", () => {
  it("defines the canonical SLO contract", () => {
    expect(G.slo.availabilityPercent).toBe(99.9);
    expect(G.slo.apiSuccessPercent).toBe(99.5);
    expect(G.slo.syncSuccessPercent).toBe(99.9);
    expect(G.slo.p95LatencyMs).toBe(500);
    expect(G.slo.tenantIsolationViolations).toBe(0);
  });

  it("defines fail-closed error-budget policy", () => {
    expect(G.errorBudget.releaseBlockOnBudgetExhaustion).toBe(true);
    expect(G.releaseGate.failClosed).toBe(true);
  });

  it("classifies measured SLO breaches as failure", () => {
    const report = globalSloEvaluator.evaluateProductionSlos({
      availabilityPercent: 99.0,
      apiSuccessPercent: 99.9,
      syncSuccessPercent: 100,
      currentP95LatencyMs: 200,
      inventoryIntegrityPercent: 100,
      tenantIsolationViolationCount: 0,
      dataLossIncidentCount: 0,
    });
    expect(report.overallCompliance).toBe("PASS");
    expect(report.targets.availability.status).toBe("AT_RISK");
    const breached = globalSloEvaluator.evaluateProductionSlos({
      availabilityPercent: 98.0,
      apiSuccessPercent: 99.9,
      syncSuccessPercent: 100,
      currentP95LatencyMs: 200,
      inventoryIntegrityPercent: 100,
      tenantIsolationViolationCount: 0,
      dataLossIncidentCount: 0,
    });
    expect(breached.overallCompliance).toBe("FAIL");
  });

  it("promotes sync staleness and failure rates to critical health", () => {
    globalSyncMonitor.clear();
    for (let i = 0; i < 10; i++) {
      globalSyncMonitor.recordSyncEvent({
        tenantId: "tenant-reliability",
        branchId: "branch-1",
        deviceId: "device-1",
        operationId: `op-${i}`,
        entityType: "Product",
        status: "FAILED",
        durationMs: 100,
        errorReason: "synthetic failure",
        timestamp: Date.now(),
      });
    }
    expect(globalSyncMonitor.getSummary().healthStatus).toBe("CRITICAL");
    expect(globalSyncMonitor.getDeadLetters("tenant-reliability")).toHaveLength(10);
  });

  it("keeps release regression fail-closed", () => {
    const report = globalRegressionAnalyzer.analyzeReleaseRegression(
      { revisionName: "current", gitSha: "current", errorRatePercent: 8, p95LatencyMs: 800, syncFailureRatePercent: 5, incidentCount: 1 },
      { revisionName: "previous", gitSha: "previous", errorRatePercent: 0.1, p95LatencyMs: 100, syncFailureRatePercent: 0.1, incidentCount: 0 },
    );
    expect(report.status).toBe("RED");
    expect(report.decision).toBe("TRIGGER_ROLLBACK");
  });

  it("requires explicit delegated governance authorities", () => {
    expect(G.releaseGate.delegatedGates).toHaveLength(8);
    expect(G.releaseGate.requiredChecks).toContain("slo-calculation-evidence-bound");
    expect(G.releaseGate.requiredChecks).toContain("health-probes-fail-closed");
    expect(G.releaseGate.requiredChecks).toContain("delegated-governance-convergence");
  });

  it("requires incident evidence and sync convergence controls", () => {
    expect(G.incidentManagement.requireIncidentId).toBe(true);
    expect(G.incidentManagement.requireTimeline).toBe(true);
    expect(G.incidentManagement.requireEvidenceReference).toBe(true);
    expect(G.syncReliability.requireDeadLetterVisibility).toBe(true);
    expect(G.syncReliability.requireConvergenceEvidence).toBe(true);
  });
});
