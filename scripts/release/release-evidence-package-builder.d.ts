/**
 * KwakoPos Release Engineering Platform v2 — Release Evidence Package Builder
 * Computes overall Release Quality Score (0-100) and compiles `/release-evidence/` audit packages.
 */
export interface ReleaseQualityScoreReport {
    version: string;
    releaseQualityScore: number;
    grade: "A+" | "A" | "B" | "C" | "F";
    breakdown: {
        testingScore: number;
        securityScore: number;
        supplyChainScore: number;
        performanceScore: number;
        domainCertScore: number;
    };
    certified: boolean;
}
export interface ReleaseEvidencePackage {
    releaseId: string;
    version: string;
    gitSha: string;
    artifactDigest: string;
    createdAt: string;
    qualityScoreReport: ReleaseQualityScoreReport;
    filesIncluded: string[];
}
export declare function computeReleaseQualityScore(unitTestsPassRate?: number, vulnerabilitiesCount?: number, hasSBOMAndProvenance?: boolean, latencyP95Ms?: number, domainCertPassRate?: number): ReleaseQualityScoreReport;
export declare function buildReleaseEvidencePackage(releaseId: string, version: string, gitSha: string, artifactDigest: string): ReleaseEvidencePackage;
//# sourceMappingURL=release-evidence-package-builder.d.ts.map