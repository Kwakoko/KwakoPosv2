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
export declare class ReleaseRegressionAnalyzer {
    analyzeReleaseRegression(current: ReleaseMetricsSnapshot, previous: ReleaseMetricsSnapshot): ReleaseRegressionReport;
}
export declare const globalRegressionAnalyzer: ReleaseRegressionAnalyzer;
//# sourceMappingURL=regressionAnalyzer.d.ts.map