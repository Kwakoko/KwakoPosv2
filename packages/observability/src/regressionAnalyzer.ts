export interface ReleaseMetricsSnapshot {
  revisionName: string;
  gitSha: string;
  errorRatePercent: number;
  p95LatencyMs: number;
  syncFailureRatePercent: number;
  incidentCount: number;
}

export interface ReleaseRegressionReport {
  currentRevision: string;
  previousRevision: string;
  status: "GREEN" | "YELLOW" | "RED";
  decision: "PROCEED_PROMOTION" | "OBSERVE" | "TRIGGER_ROLLBACK";
  delta: {
    errorRateDeltaPercent: number;
    p95LatencyDeltaMs: number;
    syncFailureDeltaPercent: number;
    newIncidentCount: number;
  };
  reasons: string[];
  evaluatedAt: string;
}

export class ReleaseRegressionAnalyzer {
  analyzeReleaseRegression(
    current: ReleaseMetricsSnapshot,
    previous: ReleaseMetricsSnapshot
  ): ReleaseRegressionReport {
    const errorRateDelta = Number((current.errorRatePercent - previous.errorRatePercent).toFixed(2));
    const latencyDelta = Number((current.p95LatencyMs - previous.p95LatencyMs).toFixed(2));
    const syncFailureDelta = Number((current.syncFailureRatePercent - previous.syncFailureRatePercent).toFixed(2));
    const newIncidents = Math.max(0, current.incidentCount - previous.incidentCount);

    const reasons: string[] = [];
    let status: "GREEN" | "YELLOW" | "RED" = "GREEN";
    let decision: "PROCEED_PROMOTION" | "OBSERVE" | "TRIGGER_ROLLBACK" = "PROCEED_PROMOTION";

    // Critical regressions -> RED
    if (errorRateDelta > 5.0) {
      status = "RED";
      reasons.push(`Critical error rate spike: +${errorRateDelta}% over baseline.`);
    }
    if (syncFailureDelta > 3.0) {
      status = "RED";
      reasons.push(`Critical sync failure spike: +${syncFailureDelta}% over baseline.`);
    }
    if (newIncidents > 0) {
      status = "RED";
      reasons.push(`${newIncidents} active incident(s) triggered on current revision.`);
    }

    // Moderate degradation -> YELLOW (if not already RED)
    if (status !== "RED") {
      if (errorRateDelta > 1.0) {
        status = "YELLOW";
        reasons.push(`Moderate error rate increase: +${errorRateDelta}%.`);
      }
      if (latencyDelta > 150) {
        status = "YELLOW";
        reasons.push(`P95 latency increased by +${latencyDelta}ms.`);
      }
    }

    if (status === "RED") {
      decision = "TRIGGER_ROLLBACK";
    } else if (status === "YELLOW") {
      decision = "OBSERVE";
    }

    if (reasons.length === 0) {
      reasons.push("All release telemetry is within certified baselines.");
    }

    return {
      currentRevision: current.revisionName,
      previousRevision: previous.revisionName,
      status,
      decision,
      delta: {
        errorRateDeltaPercent: errorRateDelta,
        p95LatencyDeltaMs: latencyDelta,
        syncFailureDeltaPercent: syncFailureDelta,
        newIncidentCount: newIncidents,
      },
      reasons,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

export const globalRegressionAnalyzer = new ReleaseRegressionAnalyzer();