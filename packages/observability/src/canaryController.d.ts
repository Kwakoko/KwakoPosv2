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
    stages: Array<{
        trafficPercentage: number;
        minObservationMinutes: number;
    }>;
    maxErrorRate: number;
    maxP95LatencyMs: number;
    maxSyncFailureRate: number;
    maxInventoryAnomalies: number;
}
export declare const DEFAULT_CANARY_POLICY: CanaryPolicy;
export declare class CanaryController {
    private policy;
    private currentStageIndex;
    private stages;
    constructor(policy?: CanaryPolicy);
    getCurrentStage(): CanaryStage;
    getAllStages(): CanaryStage[];
    evaluateStageHealth(metrics: {
        errorRate: number;
        p95LatencyMs: number;
        syncFailureRate: number;
        inventoryAnomalies: number;
        syntheticFailures: number;
    }): {
        passed: boolean;
        reason: string;
    };
    advanceStage(): {
        advanced: boolean;
        newTrafficPercentage: number;
        message: string;
    };
}
//# sourceMappingURL=canaryController.d.ts.map