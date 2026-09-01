export interface ProgressiveRolloutConfig {
    version: string;
    strategy: "CANARY" | "BLUE_GREEN" | "ROLLING";
    currentStage: "INTERNAL" | "CANARY_TENANT" | "PERCENT_1" | "PERCENT_5" | "PERCENT_25" | "PERCENT_50" | "PERCENT_100";
    trafficPercentage: number;
    internalTenants: string[];
    canaryTenants: string[];
    haltOnTenantErrorRatePct: number;
}
export declare class ProgressiveDeliveryController {
    private config;
    private rolloutLog;
    constructor(version?: string);
    getStatus(): ProgressiveRolloutConfig & {
        history: Array<{
            timestamp: string;
            stage: string;
            trafficPct: number;
            status: string;
        }>;
    };
    isTenantEligibleForVersion(tenantId: string): boolean;
    promoteStage(): {
        success: boolean;
        newStage: string;
        trafficPercentage: number;
    };
    haltRollout(reason: string): {
        status: string;
        reason: string;
    };
}
//# sourceMappingURL=progressive-delivery-controller.d.ts.map