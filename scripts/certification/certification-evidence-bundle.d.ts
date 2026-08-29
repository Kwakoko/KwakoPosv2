export interface CertificationEvidencePackage {
    certificationId: string;
    timestamp: string;
    appVersion: string;
    gitSha: string;
    gitBranch: string;
    environment: string;
    overallStatus: "CERTIFIED" | "FAILED";
    certificationScore: number;
    domainScorecard: Record<string, {
        status: "PASS" | "FAIL";
        details: string;
    }>;
    evidenceArtifacts: {
        provenancePath: string;
        sbomPath: string;
        attackSimulationPath?: string;
        chaosResultsPath?: string;
    };
    digest: string;
}
export declare function compileCertificationEvidencePackage(version: string | undefined, gitSha: string | undefined, scorecard: Record<string, {
    status: "PASS" | "FAIL";
    details: string;
}>): CertificationEvidencePackage;
//# sourceMappingURL=certification-evidence-bundle.d.ts.map