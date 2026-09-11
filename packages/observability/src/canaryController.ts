import type { SloReport } from "./sloEvaluator.js";

export interface CanaryStage {
  stageIndex: number;
  trafficPercentage: number;
  minObservationMinutes: number;
  status: "PENDING" | "ACTIVE" | "EVALUATING" | "PASSED" | "FAILED";
  startedAt?: string;
  evaluatedAt?: string;
  metricsSnapshot?: {
    errorRate: number;
    p95LatencyMs: number;
    syncFailureRate: number;
    inventoryAnomalies: number;
    syntheticFailures: number;
  };
}

export interface CanaryPolicy {
  stages: Array<{ trafficPercentage: number; minObservationMinutes: number }>;
  maxErrorRate: number; // e.g. 0.005 (0.5%)
  maxP95LatencyMs: number; // e.g. 500ms
  maxSyncFailureRate: number; // e.g. 0.01 (1.0%)
  maxInventoryAnomalies: number; // strictly 0
}

export const DEFAULT_CANARY_POLICY: CanaryPolicy = {
  stages: [
    { trafficPercentage: 0, minObservationMinutes: 0 },
    { trafficPercentage: 1, minObservationMinutes: 2 },
    { trafficPercentage: 5, minObservationMinutes: 5 },
    { trafficPercentage: 25, minObservationMinutes: 10 },
    { trafficPercentage: 50, minObservationMinutes: 15 },
    { trafficPercentage: 100, minObservationMinutes: 30 },
  ],
  maxErrorRate: 0.005,
  maxP95LatencyMs: 500,
  maxSyncFailureRate: 0.01,
  maxInventoryAnomalies: 0,
};

export class CanaryController {
  private policy: CanaryPolicy;
  private currentStageIndex: number = 0;
  private stages: CanaryStage[];

  constructor(policy: CanaryPolicy = DEFAULT_CANARY_POLICY) {
    this.policy = policy;
    this.stages = policy.stages.map((s, idx) => ({
      stageIndex: idx,
      trafficPercentage: s.trafficPercentage,
      minObservationMinutes: s.minObservationMinutes,
      status: idx === 0 ? "PASSED" : "PENDING",
    }));
  }

  public getCurrentStage(): CanaryStage {
    return this.stages[this.currentStageIndex];
  }

  public getAllStages(): CanaryStage[] {
    return [...this.stages];
  }

  public evaluateStageHealth(metrics: {
    errorRate: number;
    p95LatencyMs: number;
    syncFailureRate: number;
    inventoryAnomalies: number;
    syntheticFailures: number;
  }): { passed: boolean; reason: string } {
    const current = this.stages[this.currentStageIndex];
    current.evaluatedAt = new Date().toISOString();
    current.metricsSnapshot = metrics;

    if (metrics.inventoryAnomalies > this.policy.maxInventoryAnomalies) {
      current.status = "FAILED";
      return {
        passed: false,
        reason: `CRITICAL_DATA_INTEGRITY: ${metrics.inventoryAnomalies} inventory anomalies detected during canary stage ${current.trafficPercentage}%.`,
      };
    }

    if (metrics.syntheticFailures > 0) {
      current.status = "FAILED";
      return {
        passed: false,
        reason: `SYNTHETIC_REGRESSION: ${metrics.syntheticFailures} synthetic monitoring failures during canary stage.`,
      };
    }

    if (metrics.errorRate > this.policy.maxErrorRate) {
      current.status = "FAILED";
      return {
        passed: false,
        reason: `HIGH_ERROR_RATE: Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold ${(this.policy.maxErrorRate * 100).toFixed(2)}%.`,
      };
    }

    if (metrics.p95LatencyMs > this.policy.maxP95LatencyMs) {
      current.status = "FAILED";
      return {
        passed: false,
        reason: `LATENCY_DEGRADATION: P95 latency ${metrics.p95LatencyMs}ms exceeds SLA limit ${this.policy.maxP95LatencyMs}ms.`,
      };
    }

    if (metrics.syncFailureRate > this.policy.maxSyncFailureRate) {
      current.status = "FAILED";
      return {
        passed: false,
        reason: `SYNC_DEGRADATION: Sync failure rate ${(metrics.syncFailureRate * 100).toFixed(2)}% exceeds threshold ${(this.policy.maxSyncFailureRate * 100).toFixed(2)}%.`,
      };
    }

    current.status = "PASSED";
    return { passed: true, reason: `Canary stage ${current.trafficPercentage}% healthy and compliant.` };
  }

  public advanceStage(): { advanced: boolean; newTrafficPercentage: number; message: string } {
    const current = this.stages[this.currentStageIndex];
    if (current.status !== "PASSED" && current.stageIndex !== 0) {
      return {
        advanced: false,
        newTrafficPercentage: current.trafficPercentage,
        message: `Cannot advance canary stage. Current stage ${current.trafficPercentage}% status is ${current.status}.`,
      };
    }

    if (this.currentStageIndex >= this.stages.length - 1) {
      return {
        advanced: false,
        newTrafficPercentage: 100,
        message: "Canary already at 100% production traffic.",
      };
    }

    this.currentStageIndex += 1;
    const nextStage = this.stages[this.currentStageIndex];
    nextStage.status = "ACTIVE";
    nextStage.startedAt = new Date().toISOString();

    return {
      advanced: true,
      newTrafficPercentage: nextStage.trafficPercentage,
      message: `Canary advanced to ${nextStage.trafficPercentage}% traffic.`,
    };
  }

  /**
   * H-019: Evaluate an active production SLO report against canary policy.
   * If any SLO target is BREACHED, recommend and trigger immediate automatic rollback.
   */
  public evaluateSloReport(report: SloReport): {
    passed: boolean;
    triggerRollback: boolean;
    breachedSlos: string[];
    reason: string;
  } {
    const breached: string[] = [];

    if (report.targets.availability.status === "BREACHED") {
      breached.push(`Availability (${report.targets.availability.currentPercent}% < ${report.targets.availability.targetPercent}%)`);
    }
    if (report.targets.apiSuccessRate.status === "BREACHED") {
      breached.push(`API Success Rate (${report.targets.apiSuccessRate.currentPercent}% < ${report.targets.apiSuccessRate.targetPercent}%)`);
    }
    if (report.targets.syncSuccessRate.status === "BREACHED") {
      breached.push(`Sync Success Rate (${report.targets.syncSuccessRate.currentPercent}% < ${report.targets.syncSuccessRate.targetPercent}%)`);
    }
    if (report.targets.latencyP95.status === "BREACHED") {
      breached.push(`P95 Latency (${report.targets.latencyP95.currentP95Ms}ms > ${report.targets.latencyP95.thresholdMs}ms)`);
    }
    if (report.targets.inventoryIntegrity.status === "BREACHED") {
      breached.push(`Inventory Integrity (${report.targets.inventoryIntegrity.currentPercent}% < 100%)`);
    }
    if (report.targets.tenantIsolationViolations.status === "BREACHED") {
      breached.push(`Tenant Isolation (${report.targets.tenantIsolationViolations.currentViolations} violations > 0)`);
    }
    if (report.targets.dataLossIncidents.status === "BREACHED") {
      breached.push(`Data Loss (${report.targets.dataLossIncidents.currentCount} incidents > 0)`);
    }

    if (breached.length > 0) {
      const current = this.stages[this.currentStageIndex];
      current.status = "FAILED";
      current.evaluatedAt = new Date().toISOString();
      return {
        passed: false,
        triggerRollback: true,
        breachedSlos: breached,
        reason: `SLO_BREACH_DETECTED: Canary stage ${current.trafficPercentage}% breached production SLOs: ${breached.join("; ")}. Automatic rollback required.`,
      };
    }

    return {
      passed: true,
      triggerRollback: false,
      breachedSlos: [],
      reason: "All production SLOs compliant with canary policy.",
    };
  }

  /**
   * H-019: Execute an automated canary rollback to revert candidate traffic to 0%
   */
  public triggerAutomatedRollback(
    reason: string,
    stableRevision?: string
  ): {
    rollbackTriggered: boolean;
    previousTrafficPercentage: number;
    revertedToTrafficPercentage: number;
    targetRevision: string;
    reason: string;
    timestamp: string;
  } {
    const current = this.stages[this.currentStageIndex];
    const prevTraffic = current.trafficPercentage;
    const now = new Date().toISOString();

    current.status = "FAILED";
    current.evaluatedAt = now;

    // Reset back to baseline stage 0 (0% traffic)
    this.currentStageIndex = 0;
    this.stages[0].status = "PASSED";

    return {
      rollbackTriggered: true,
      previousTrafficPercentage: prevTraffic,
      revertedToTrafficPercentage: 0,
      targetRevision: stableRevision || "PREVIOUS_STABLE_PRODUCTION",
      reason: `AUTO_ROLLBACK_EXECUTED: ${reason}`,
      timestamp: now,
    };
  }
}