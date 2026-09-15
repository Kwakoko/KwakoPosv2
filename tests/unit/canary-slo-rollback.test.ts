import { describe, it, expect } from "vitest";
import { CanaryController, SloEvaluator } from "@kwakopos2/observability";

describe("H-019: Canary Controller Automated SLO Breach Rollback Suite", () => {
  it("should detect compliant SLO report and allow canary advancement", () => {
    const controller = new CanaryController();
    const evaluator = new SloEvaluator();

    const report = evaluator.evaluateProductionSlos({
      availabilityPercent: 99.95,
      apiSuccessPercent: 99.8,
      syncSuccessPercent: 99.95,
      currentP95LatencyMs: 120,
      inventoryIntegrityPercent: 100,
      tenantIsolationViolationCount: 0,
      dataLossIncidentCount: 0,
    });

    const evalResult = controller.evaluateSloReport(report);
    expect(evalResult.passed).toBe(true);
    expect(evalResult.triggerRollback).toBe(false);

    const advance = controller.advanceStage();
    expect(advance.advanced).toBe(true);
    expect(advance.newTrafficPercentage).toBe(1);
  });

  it("should detect SLO breach and trigger automatic rollback to 0%", () => {
    const controller = new CanaryController();
    const evaluator = new SloEvaluator();

    // Advance to 1% then 5%
    controller.advanceStage();
    // Simulate passing stage 1
    controller.evaluateStageHealth({
      errorRate: 0.001,
      p95LatencyMs: 100,
      syncFailureRate: 0.001,
      inventoryAnomalies: 0,
      syntheticFailures: 0,
    });
    controller.advanceStage(); // Now at 5%

    expect(controller.getCurrentStage().trafficPercentage).toBe(5);

    // Simulate SLO breach during 5% traffic: Tenant isolation violated + P95 latency spike
    const breachedReport = evaluator.evaluateProductionSlos({
      availabilityPercent: 98.5, // BREACHED (<99.0)
      apiSuccessPercent: 97.0,   // BREACHED (<98.5)
      syncSuccessPercent: 99.9,
      currentP95LatencyMs: 1200, // BREACHED (>1000)
      inventoryIntegrityPercent: 100,
      tenantIsolationViolationCount: 1, // BREACHED (>0)
      dataLossIncidentCount: 0,
    });

    const evalResult = controller.evaluateSloReport(breachedReport);
    expect(evalResult.passed).toBe(false);
    expect(evalResult.triggerRollback).toBe(true);
    expect(evalResult.breachedSlos.length).toBeGreaterThanOrEqual(3);

    // Execute automated rollback
    const rollback = controller.triggerAutomatedRollback(
      evalResult.reason,
      "kwakopos-production-service-00032-niq"
    );

    expect(rollback.rollbackTriggered).toBe(true);
    expect(rollback.previousTrafficPercentage).toBe(5);
    expect(rollback.revertedToTrafficPercentage).toBe(0);
    expect(rollback.targetRevision).toBe("kwakopos-production-service-00032-niq");
    expect(controller.getCurrentStage().trafficPercentage).toBe(0);
  });
});
