export type ReleaseState = "DRAFT" | "VERSIONED" | "BUILT" | "CANDIDATE_DEPLOYED" | "CERTIFICATION_PENDING" | "CERTIFIED" | "CANARY" | "CANARY_HEALTHY" | "PRODUCTION_PROMOTION" | "LIVE" | "MONITORING" | "RELEASE_HEALTHY" | "RELEASE_STABLE" | "CERTIFICATION_FAILED" | "DEPLOYMENT_FAILED" | "CANARY_FAILED" | "HEALTH_DEGRADED" | "ROLLBACK_REQUESTED" | "ROLLBACK_EXECUTED" | "ROLLBACK_VERIFIED";
export interface ReleaseLineage {
    releaseId: string;
    appVersion: string;
    gitTag: string;
    gitSha: string;
    containerDigest: string;
    cloudRunRevision: string;
    state: ReleaseState;
    trafficPercentage: number;
    certificationStatus: "PENDING" | "PASS" | "FAIL";
    healthStatus: "GREEN" | "YELLOW" | "RED";
    canaryStage?: string;
    createdAt: string;
    promotedAt?: string;
    stableAt?: string;
    rollbackEligible: boolean;
    rollbackTargetRevision?: string;
    stateHistory: Array<{
        state: ReleaseState;
        timestamp: string;
        reason?: string;
    }>;
}
export declare class ReleaseStateMachine {
    private static VALID_TRANSITIONS;
    static canTransition(current: ReleaseState, next: ReleaseState): boolean;
    static transition(lineage: ReleaseLineage, next: ReleaseState, reason?: string): ReleaseLineage;
}
//# sourceMappingURL=releaseStateMachine.d.ts.map