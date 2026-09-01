export interface SecurityEvidencePackage {
    securityCertificationId: string;
    timestamp: string;
    appVersion: string;
    gitSha: string;
    assessmentReadinessState: "Security Controls Implemented and Assessment-Ready";
    prohibitedClaimsNotice: string;
    overallPassed: boolean;
    scorePercentage: number;
    securityScorecard: Record<string, {
        status: "PASS" | "FAIL";
        details: string;
    }>;
    evidenceArtifactPath: string;
    digest: string;
}
export declare function runSecurityCertificationEngine(version?: string, gitSha?: string): Promise<{
    passed: boolean;
    package: SecurityEvidencePackage;
}>;
//# sourceMappingURL=security-certification-engine.d.ts.map