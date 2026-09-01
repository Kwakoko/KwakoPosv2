export interface RiskAssessmentInput {
    filesChanged?: number;
    modulesChanged?: string[];
    hasDatabaseMigration?: boolean;
    hasApiChanges?: boolean;
    hasAuthChanges?: boolean;
    hasBillingChanges?: boolean;
    hasSyncChanges?: boolean;
    hasInventoryChanges?: boolean;
    securityFindingsCount?: number;
    testCoverageDelta?: number;
}
export interface RiskAssessmentResult {
    score: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    factors: Array<{
        factor: string;
        points: number;
        description: string;
    }>;
    recommendedMitigations: string[];
    requiresManualApproval: boolean;
    canaryStrategy: string;
}
export declare function evaluateReleaseRisk(input?: RiskAssessmentInput): RiskAssessmentResult;
//# sourceMappingURL=release-risk-engine.d.ts.map