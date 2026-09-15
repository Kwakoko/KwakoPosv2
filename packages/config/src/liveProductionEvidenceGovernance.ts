export const LIVE_PRODUCTION_EVIDENCE_GOVERNANCE = {
  version: "1.0.0",
  certificateId: "KWAKOKO-LIVE-PRODUCTION-EVIDENCE-CERTIFICATE-v1.0",
  lifecycle: ["PRECHECK", "DEPLOY_ZERO", "VERIFY_LIVE", "CANARY", "OBSERVE", "PROMOTE", "RECONCILE", "COMPLETE"] as const,
  evidenceClasses: ["PRODUCTION", "DEPLOYED", "CONTROLLED", "SIMULATED", "CLAIMED"] as const,
  mandatoryGates: [
    "step25ProductionAuthority",
    "productionCertificationMode",
    "realGitSha",
    "realContainerDigest",
    "realCloudRunRevision",
    "liveHttpsHealth",
    "liveHttpsReadiness",
    "liveHttpsIdentity",
    "browserRuntimeEvidence",
    "syncConvergenceEvidence",
    "databaseReconciliationEvidence",
    "tenantIsolationEvidence",
    "observabilityEvidence",
    "progressiveTrafficEvidence",
    "rollbackReadinessEvidence",
    "postReleaseReconciliation",
  ],
  invariants: [
    "simulationCannotBecomeProductionEvidence",
    "claimedOutcomeCannotBecomeProductionEvidence",
    "developmentFallbacksCannotRunInProductionCertification",
    "liveIdentityMustMatchCertifiedCandidate",
    "liveEvidenceMustBeRevisionBound",
    "tenantIsolationMustRemainVerified",
    "syncConvergenceMustRemainVerified",
    "databaseReconciliationMustRemainVerified",
    "trafficMustBeMeasuredFromLiveControlPlane",
    "rollbackMustRemainAvailable",
    "missingEvidenceBlocks",
    "failedEvidenceBlocks",
  ],
  delegatedAuthorities: {
    unifiedCertification: "scripts/release/verify-release-certification-governance.ts",
    productionAuthority: "packages/config/src/productionReleaseAuthority.ts",
    candidateDeployment: "scripts/release/deploy-candidate.ts",
    deployedCertification: "scripts/release/certify-deployed.ts",
    browserCertification: "artifacts/release-evidence/kwakopos-browser-certification-evidence.json",
    syncConvergence: "artifacts/release-evidence/kwakopos-browser-certification-evidence.json",
    databaseMigration: "scripts/release/database-migration-gate.ts",
    rollback: "scripts/release/rollback-engine.ts",
  },
} as const;

export type LiveEvidenceClass = (typeof LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.evidenceClasses)[number];
export type LiveProductionDecision = "PASS" | "BLOCK" | "HOLD";

export function isRealLiveEvidence(value: unknown): boolean {
  return value === "PRODUCTION" || value === "DEPLOYED";
}
