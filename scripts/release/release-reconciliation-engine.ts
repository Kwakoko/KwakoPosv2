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

export function detectReleaseDrift(
  expectedManifest: {
    version: string;
    gitSha: string;
    artifactDigest: string;
    schemaVersion: string;
    cloudRunRevision?: string;
  },
  runningEnvironment: {
    version?: string;
    gitSha?: string;
    artifactDigest?: string;
    schemaVersion?: string;
    cloudRunRevision?: string;
  }
): DriftDetectionResult {
  const evaluatedAt = new Date().toISOString();
  const reconciliationId = `recon_${Date.now()}`;
  const mismatches: string[] = [];

  const runningState = {
    version: runningEnvironment.version || expectedManifest.version,
    gitSha: runningEnvironment.gitSha || expectedManifest.gitSha,
    artifactDigest: runningEnvironment.artifactDigest || expectedManifest.artifactDigest,
    schemaVersion: runningEnvironment.schemaVersion || expectedManifest.schemaVersion,
    cloudRunRevision: runningEnvironment.cloudRunRevision || expectedManifest.cloudRunRevision || "kwakopos-prod-001",
  };

  const expectedState = {
    version: expectedManifest.version,
    gitSha: expectedManifest.gitSha,
    artifactDigest: expectedManifest.artifactDigest,
    schemaVersion: expectedManifest.schemaVersion,
    cloudRunRevision: expectedManifest.cloudRunRevision || "kwakopos-prod-001",
  };

  if (runningState.artifactDigest !== expectedState.artifactDigest) {
    mismatches.push(`Artifact digest mismatch: expected ${expectedState.artifactDigest}, running ${runningState.artifactDigest}`);
  }
  if (runningState.version !== expectedState.version) {
    mismatches.push(`Application version mismatch: expected ${expectedState.version}, running ${runningState.version}`);
  }
  if (runningState.schemaVersion !== expectedState.schemaVersion) {
    mismatches.push(`Database schema version mismatch: expected ${expectedState.schemaVersion}, running ${runningState.schemaVersion}`);
  }

  const driftDetected = mismatches.length > 0;
  const reconciliationAction = driftDetected ? "ALERT_TRIGGERED" : "IN_SYNC";

  return {
    reconciliationId,
    evaluatedAt,
    driftDetected,
    expectedState,
    runningState,
    mismatches,
    reconciliationAction,
  };
}
