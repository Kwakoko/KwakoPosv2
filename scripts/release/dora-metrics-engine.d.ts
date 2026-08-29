export interface DORAMetricsReport {
    deploymentFrequencyPerWeek: number;
    leadTimeForChangesHours: number;
    meanTimeToRecoveryMinutes: number;
    changeFailureRatePercentage: number;
    deploymentReworkRatePercentage: number;
    performanceTier: "ELITE" | "HIGH" | "MEDIUM" | "LOW";
    recentIncidents: Array<{
        incidentId: string;
        releaseId: string;
        version: string;
        commitHash: string;
        severity: string;
        detectedAt: string;
        resolvedAt?: string;
        rollbackTriggered: boolean;
    }>;
}
export declare function computeDORAMetrics(): DORAMetricsReport;
//# sourceMappingURL=dora-metrics-engine.d.ts.map