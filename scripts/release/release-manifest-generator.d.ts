export interface ReleaseManifest {
    product: string;
    version: string;
    gitSha: string;
    buildId: string;
    artifactDigest: string;
    schemaVersion: string;
    sbomReference: string;
    provenanceReference: string;
    releaseRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    deploymentStrategy: "CANARY" | "BLUE_GREEN" | "ROLLING" | "IMMEDIATE";
    createdAt: string;
    builderIdentity: string;
    targetEnvironment: string;
}
export declare function generateReleaseManifest(options?: {
    version?: string;
    gitSha?: string;
    buildId?: string;
    releaseRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}): ReleaseManifest;
//# sourceMappingURL=release-manifest-generator.d.ts.map