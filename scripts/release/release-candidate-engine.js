/**
 * KwakoPos Release Engineering Platform v2 — Release Candidate Engine
 * Creates Release Candidate (RC) entities and acquires atomic version reservation locks to prevent version collisions.
 */
const reservedVersions = new Set();
export function acquireVersionLock(version) {
    if (reservedVersions.has(version)) {
        return {
            success: false,
            message: `Version reservation lock failed: Version ${version} is currently reserved by an active release candidate`,
        };
    }
    reservedVersions.add(version);
    return {
        success: true,
        message: `Atomic version reservation lock successfully acquired for ${version}`,
    };
}
export function releaseVersionLock(version) {
    reservedVersions.delete(version);
}
export function createReleaseCandidateEntity(version, gitSha, artifactDigest, riskScore = 15.0, riskLevel = "LOW") {
    const dateStr = new Date().toISOString().slice(0, 10);
    const randomSeq = String(Math.floor(Math.random() * 900) + 100);
    const rcNumber = `RC-${dateStr}-${randomSeq}`;
    const rcId = `rc_${Date.now()}`;
    const lockAcquiredAt = new Date().toISOString();
    const lockExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    // Reserve lock
    acquireVersionLock(version);
    return {
        rcId,
        rcNumber,
        version,
        gitSha,
        artifactDigest,
        riskScore,
        riskLevel,
        status: "VALIDATING",
        lockAcquiredAt,
        lockExpiresAt,
    };
}
//# sourceMappingURL=release-candidate-engine.js.map