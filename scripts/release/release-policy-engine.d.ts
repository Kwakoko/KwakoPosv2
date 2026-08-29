/**
 * KwakoPos Release Engineering Platform v2 — Policy Engine
 * Evaluates 15 declarative release policy categories and outputs immutable policy decision records.
 */
export interface ReleasePolicyConfig {
    policyVersion: string;
    environment: string;
    requiredChecks: string[];
    vulnerabilityPolicy: {
        critical: number;
        high: number;
    };
    coverage: {
        minimumPercent: number;
    };
    deployment: {
        strategy: "canary" | "blue_green" | "rolling";
    };
    canary: {
        initialPercent: number;
        observationMinutes: number;
    };
    rollback: {
        errorRateThresholdPercent: number;
        latencyRegressionPercent: number;
    };
    tenantSafety: {
        requireStrictBoundaryValidation: boolean;
    };
}
export interface PolicyEvaluationResult {
    policy: string;
    releaseId: string;
    version: string;
    decision: "PASS" | "FAIL" | "BLOCKED";
    evaluatedAt: string;
    rulesEvaluated: number;
    rulesPassed: number;
    rulesFailed: number;
    categories: Record<string, {
        status: "PASS" | "FAIL";
        message: string;
    }>;
    reasons: string[];
}
export declare const DEFAULT_PRODUCTION_POLICY: ReleasePolicyConfig;
export declare function evaluateReleasePolicies(releaseId: string, version: string, evidence: {
    criticalVulnerabilities?: number;
    highVulnerabilities?: number;
    testCoveragePercent?: number;
    hasProvenance?: boolean;
    hasSBOM?: boolean;
    hasAttestation?: boolean;
    hasMigrationBackup?: boolean;
    tenantIsolationPassed?: boolean;
    approvalPresent?: boolean;
    riskLevel?: string;
}, config?: ReleasePolicyConfig): PolicyEvaluationResult;
//# sourceMappingURL=release-policy-engine.d.ts.map