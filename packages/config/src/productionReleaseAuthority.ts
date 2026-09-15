export const PRODUCTION_RELEASE_AUTHORITY_VERSION = "1.0.0";
export const PRODUCTION_RELEASE_CERTIFICATE = "KWAKOKO-PRODUCTION-RELEASE-CERTIFICATE-v1.0";

export type ReleaseTrafficStage =
  | "ZERO_TRAFFIC"
  | "INTERNAL"
  | "CANARY_TENANT"
  | "PERCENT_1"
  | "PERCENT_5"
  | "PERCENT_25"
  | "PERCENT_50"
  | "PERCENT_100"
  | "ROLLED_BACK"
  | "COMPLETED";
export type ProductionReleaseDecision = "PASS" | "BLOCK" | "HOLD";

export const PRODUCTION_RELEASE_STAGES: ReadonlyArray<{ stage: ReleaseTrafficStage; trafficPercent: number }> = [
  { stage: "ZERO_TRAFFIC", trafficPercent: 0 },
  { stage: "INTERNAL", trafficPercent: 0 },
  { stage: "CANARY_TENANT", trafficPercent: 0 },
  { stage: "PERCENT_1", trafficPercent: 1 },
  { stage: "PERCENT_5", trafficPercent: 5 },
  { stage: "PERCENT_25", trafficPercent: 25 },
  { stage: "PERCENT_50", trafficPercent: 50 },
  { stage: "PERCENT_100", trafficPercent: 100 },
];

export const PRODUCTION_RELEASE_INVARIANTS = [
  "CERTIFIED_CANDIDATE_REQUIRED",
  "AUTHENTIC_RELEASE_IDENTITY_REQUIRED",
  "ZERO_TRAFFIC_VALIDATION_REQUIRED",
  "TRAFFIC_INCREASE_REQUIRES_HEALTH_EVIDENCE",
  "OBSERVATION_WINDOW_REQUIRED",
  "TENANT_CANARY_BOUNDARY_REQUIRED",
  "LIVE_IDENTITY_MATCH_REQUIRED",
  "ROLLBACK_PATH_REQUIRED",
  "ROLLBACK_TRIGGER_MUST_FAIL_CLOSED",
  "KILL_SWITCH_REQUIRED",
  "NO_SYNTHETIC_HEALTH_CLAIMS",
  "NO_UNVERIFIED_PRODUCTION_CLAIMS",
  "TOTAL_TRAFFIC_MUST_EQUAL_100",
  "AUDIT_EVIDENCE_REQUIRED",
  "PROGRESSIVE_STAGE_ORDER_REQUIRED",
  "PRIOR_STABLE_RELEASE_REQUIRED_FOR_ROLLBACK",
] as const;

export const PRODUCTION_RELEASE_GATES = [
  "unified-certification",
  "release-identity",
  "candidate-readiness",
  "zero-traffic-deployment",
  "tenant-canary",
  "health-readiness",
  "live-identity",
  "synchronization",
  "database-compatibility",
  "observability",
  "performance",
  "rollback-readiness",
  "kill-switch",
  "traffic-integrity",
  "audit-evidence",
] as const;

export const PRODUCTION_RELEASE_AUTHORITY = {
  authority: "Kwakoko Production Release Authority",
  version: PRODUCTION_RELEASE_AUTHORITY_VERSION,
  certificate: PRODUCTION_RELEASE_CERTIFICATE,
  lifecycle: ["CERTIFY", "DEPLOY_ZERO", "OBSERVE", "PROMOTE", "VERIFY", "ROLLBACK_OR_COMPLETE"],
  evidenceClasses: ["PRODUCTION", "DEPLOYED", "CONTROLLED", "SIMULATED", "CLAIMED"],
  gates: PRODUCTION_RELEASE_GATES,
  invariants: PRODUCTION_RELEASE_INVARIANTS,
  delegation: {
    unifiedCertification: "scripts/release/verify-release-certification-governance.ts",
    progressiveDelivery: "scripts/release/progressive-delivery-controller.ts",
    candidateDeployment: "scripts/release/deploy-candidate.ts",
    promotion: "scripts/release/promote-revision.ts",
    rollback: "scripts/release/rollback-engine.ts",
    health: "scripts/release/health-check-gate.ts",
    authoritativeRelease: "packages/config/src/authoritativeRelease.ts",
  },
} as const;
