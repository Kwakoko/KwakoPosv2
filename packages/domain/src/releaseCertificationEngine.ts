import { createHash } from "node:crypto";
import {
  KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE,
  KWAKOKO_RELEASE_CERTIFICATION_VERSION,
  RELEASE_CERTIFICATION_DECISIONS,
  RELEASE_CERTIFICATION_GATES,
  RELEASE_CERTIFICATION_INVARIANTS,
  RELEASE_CERTIFICATION_LIFECYCLE,
  ReleaseCertificationDecision,
} from "@kwakopos2/config";

export interface ReleaseEvidenceInput {
  releaseId: string;
  version: string;
  gitSha: string;
  buildPassed: boolean;
  typecheckPassed: boolean;
  testsPassed: boolean;
  securityPassed: boolean;
  privacyPassed: boolean;
  tenantIsolationPassed: boolean;
  offlineSyncPassed: boolean;
  migrationPassed: boolean;
  reliabilityPassed: boolean;
  performancePassed: boolean;
  rollbackReady: boolean;
  provenanceVerified: boolean;
  attestationVerified: boolean;
  evidenceClassificationValid: boolean;
  governanceConvergencePassed: boolean;
  finalApprovalPresent: boolean;
  platformServicesProductionLockPassed: boolean;
  syntheticClaimsPresent?: boolean;
  productionOutcomeClaimsUnverified?: boolean;
}

export interface ReleaseCertificationResult {
  certificateId: string;
  governanceVersion: string;
  releaseId: string;
  version: string;
  decision: ReleaseCertificationDecision;
  lifecycle: typeof RELEASE_CERTIFICATION_LIFECYCLE[number];
  gatesEvaluated: number;
  gatesPassed: number;
  gatesFailed: number;
  failedGates: string[];
  invariants: string[];
  evidenceDigest: string;
  evidenceClassification: "CONTROLLED_CERTIFICATION";
  productionClaimBoundary: string;
  evaluatedAt: string;
}

export function certifyReleaseEvidence(input: ReleaseEvidenceInput): ReleaseCertificationResult {
  const gateState: Record<string, boolean> = {
    "release-identity": Boolean(input.releaseId && input.version && input.gitSha),
    "version-consistency": Boolean(input.version && input.version.trim().length > 0),
    "build-and-typecheck": input.buildPassed && input.typecheckPassed,
    "unit-and-integration-tests": input.testsPassed,
    "security-and-privacy": input.securityPassed && input.privacyPassed,
    "tenant-isolation": input.tenantIsolationPassed,
    "offline-sync": input.offlineSyncPassed,
    "database-migration": input.migrationPassed,
    "reliability": input.reliabilityPassed,
    "performance": input.performancePassed,
    "rollback": input.rollbackReady,
    "provenance": input.provenanceVerified && input.attestationVerified,
    "governance-convergence": input.governanceConvergencePassed,
    "evidence-classification": input.evidenceClassificationValid,
    "final-approval": input.finalApprovalPresent,
    "platform-services-production-lock": input.platformServicesProductionLockPassed,
  };

  if (input.syntheticClaimsPresent) gateState["governance-convergence"] = false;
  if (input.productionOutcomeClaimsUnverified) gateState["evidence-classification"] = false;

  const failedGates = RELEASE_CERTIFICATION_GATES.filter((gate) => !gateState[gate]);
  const gatesPassed = RELEASE_CERTIFICATION_GATES.length - failedGates.length;
  const decision: ReleaseCertificationDecision = failedGates.length === 0 ? "PASS" : "BLOCK";
  const canonicalEvidence = JSON.stringify({
    releaseId: input.releaseId,
    version: input.version,
    gitSha: input.gitSha,
    gateState,
    invariants: RELEASE_CERTIFICATION_INVARIANTS,
  });
  const evidenceDigest = createHash("sha256").update(canonicalEvidence).digest("hex");

  if (!RELEASE_CERTIFICATION_DECISIONS.includes(decision)) throw new Error(`Unsupported decision: ${decision}`);

  return {
    certificateId: KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE,
    governanceVersion: KWAKOKO_RELEASE_CERTIFICATION_VERSION,
    releaseId: input.releaseId,
    version: input.version,
    decision,
    lifecycle: decision === "PASS" ? "CERTIFY" : "VALIDATE",
    gatesEvaluated: RELEASE_CERTIFICATION_GATES.length,
    gatesPassed,
    gatesFailed: failedGates.length,
    failedGates,
    invariants: [...RELEASE_CERTIFICATION_INVARIANTS],
    evidenceDigest,
    evidenceClassification: "CONTROLLED_CERTIFICATION",
    productionClaimBoundary: "This certification proves controlled release-governance convergence only; it is not proof of production customer outcomes, market traction, revenue, regulatory approval, or external-provider success.",
    evaluatedAt: new Date().toISOString(),
  };
}
