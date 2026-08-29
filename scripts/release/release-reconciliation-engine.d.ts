/**
 * KwakoPos Release Engineering Platform v2 — Release Reconciliation Engine
 * Detects drift between production state (Cloud Run revision, digest, DB schema, PWA version) and expected release manifest.
 */
export interface DriftDetectionResult {
    reconciliationId: string;
    evaluatedAt: string;
    driftDetected: boolean;
    expectedState: {
        version: string;
        gitSha: string;
        artifactDigest: string;
        schemaVersion: string;
        cloudRunRevision: string;
    };
    runningState: {
        version: string;
        gitSha: string;
        artifactDigest: string;
        schemaVersion: string;
        cloudRunRevision: string;
    };
    mismatches: string[];
    reconciliationAction: "IN_SYNC" | "ALERT_TRIGGERED" | "AUTO_RECONCILED";
}
export declare function detectReleaseDrift(expectedManifest: {
    version: string;
    gitSha: string;
    artifactDigest: string;
    schemaVersion: string;
    cloudRunRevision?: string;
}, runningEnvironment: {
    version?: string;
    gitSha?: string;
    artifactDigest?: string;
    schemaVersion?: string;
    cloudRunRevision?: string;
}): DriftDetectionResult;
//# sourceMappingURL=release-reconciliation-engine.d.ts.map