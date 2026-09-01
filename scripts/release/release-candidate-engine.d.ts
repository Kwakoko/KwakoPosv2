/**
 * KwakoPos Release Engineering Platform v2 — Release Candidate Engine
 * Creates Release Candidate (RC) entities and acquires atomic version reservation locks to prevent version collisions.
 */
export interface ReleaseCandidateEntity {
    rcId: string;
    rcNumber: string;
    version: string;
    gitSha: string;
    artifactDigest: string;
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: "DRAFT" | "VALIDATING" | "CERTIFIED" | "PROMOTED" | "FAILED";
    lockAcquiredAt: string;
    lockExpiresAt: string;
}
export declare function acquireVersionLock(version: string): {
    success: boolean;
    message: string;
};
export declare function releaseVersionLock(version: string): void;
export declare function createReleaseCandidateEntity(version: string, gitSha: string, artifactDigest: string, riskScore?: number, riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): ReleaseCandidateEntity;
//# sourceMappingURL=release-candidate-engine.d.ts.map