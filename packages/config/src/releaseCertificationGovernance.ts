export const KWAKOKO_RELEASE_CERTIFICATION_VERSION = "1.0.0" as const;
export const KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE = "KWAKOKO-RELEASE-CERTIFICATION-CERTIFICATE-v1.0" as const;

export const RELEASE_CERTIFICATION_LIFECYCLE = [
  "CANDIDATE",
  "COLLECT_EVIDENCE",
  "VALIDATE",
  "CERTIFY",
  "APPROVE",
  "PROMOTE",
  "OBSERVE",
  "RECONCILE",
  "ROLLBACK_OR_COMPLETE",
] as const;

export const RELEASE_CERTIFICATION_DECISIONS = ["PASS", "HOLD", "BLOCK"] as const;
export type ReleaseCertificationDecision = typeof RELEASE_CERTIFICATION_DECISIONS[number];

export const RELEASE_CERTIFICATION_INVARIANTS = [
  "single-release-authority",
  "fail-closed",
  "authentic-release-identity",
  "version-consistency",
  "governance-convergence",
  "tenant-isolation",
  "offline-sync-integrity",
  "migration-safety",
  "security-evidence",
  "privacy-evidence",
  "reliability-evidence",
  "performance-evidence",
  "rollback-readiness",
  "provenance-and-attestation",
  "evidence-classification",
  "no-synthetic-health-claims",
  "no-unverified-production-claims",
] as const;

export const RELEASE_CERTIFICATION_REQUIRED_AUTHORITIES = {
  authoritativeRelease: "packages/config/src/authoritativeRelease.ts",
  releasePolicy: "scripts/release/release-policy-engine.ts",
  releaseState: "scripts/release/release-state-machine.ts",
  releaseCandidate: "scripts/release/release-candidate-engine.ts",
  releaseIdentity: "scripts/release/releaseIdentity.ts",
  qualityGates: "scripts/release/quality-gates.ts",
  migrationGate: "scripts/release/database-migration-gate.ts",
  productionReliability: "packages/config/src/productionReliabilityGovernance.ts",
  performanceScale: "packages/config/src/performanceScaleGovernance.ts",
  securityTrust: "packages/config/src/securityTrustGovernance.ts",
  privacyData: "packages/config/src/privacyDataGovernance.ts",
  dataLifecycleDr: "packages/config/src/dataLifecycleDrGovernance.ts",
  aiOperatingLayer: "packages/config/src/aiOperatingLayerGovernance.ts",
  autonomousOperations: "packages/config/src/autonomousOperationsGovernance.ts",
  platformGovernance: "packages/config/src/platformGovernanceControlPlane.ts",
  integration: "packages/config/src/integrationApiEcosystemGovernance.ts",
  marketplace: "packages/config/src/marketplacePartnerGovernance.ts",
  enterprise: "packages/config/src/enterpriseCustomerReadinessGovernance.ts",
  commercial: "packages/config/src/commercialProductReadinessGovernance.ts",
  platformServices: "packages/config/src/platformServicesProductionLock.ts",
} as const;

export const RELEASE_CERTIFICATION_GATES = [
  "release-identity",
  "version-consistency",
  "build-and-typecheck",
  "unit-and-integration-tests",
  "security-and-privacy",
  "tenant-isolation",
  "offline-sync",
  "database-migration",
  "reliability",
  "performance",
  "rollback",
  "provenance",
  "governance-convergence",
  "evidence-classification",
  "final-approval",
  "platform-services-production-lock",
] as const;
