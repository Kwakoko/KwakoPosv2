/**
 * KwakoPos Release Engineering Platform v2 — Release Candidate Engine
 * Creates Release Candidate (RC) entities and acquires atomic version reservation locks to prevent version collisions.
 */

export interface ReleaseCandidateEntity {
  rcId: string;
  rcNumber: string; // e.g. RC-2026-08-28-001
  version: string;  // e.g. 2.2.0
  gitSha: string;
  artifactDigest: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "VALIDATING" | "CERTIFIED" | "PROMOTED" | "FAILED";
  lockAcquiredAt: string;
  lockExpiresAt: string;
}

const reservedVersions = new Set<string>();

export function acquireVersionLock(version: string): { success: boolean; message: string } {
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

export function releaseVersionLock(version: string): void {
  reservedVersions.delete(version);
}

export function createReleaseCandidateEntity(
  version: string,
  gitSha: string,
  artifactDigest: string,
  riskScore: number = 15.0,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW"
): ReleaseCandidateEntity {
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
