import {
  PRODUCTION_RELEASE_STAGES,
  PRODUCTION_RELEASE_GATES,
  type ProductionReleaseDecision,
  type ReleaseTrafficStage,
} from "@kwakopos2/config";

export interface ProductionReleaseEvidence {
  unifiedCertification: boolean;
  authenticatedIdentity: boolean;
  candidateReady: boolean;
  zeroTrafficDeployed: boolean;
  tenantCanaryPassed: boolean;
  healthPassed: boolean;
  liveIdentityMatched: boolean;
  synchronizationPassed: boolean;
  databaseCompatibilityPassed: boolean;
  observabilityPassed: boolean;
  performancePassed: boolean;
  rollbackReady: boolean;
  killSwitchReady: boolean;
  trafficIntegrityPassed: boolean;
  auditEvidencePresent: boolean;
  evidenceClass: "PRODUCTION" | "DEPLOYED" | "CONTROLLED" | "SIMULATED" | "CLAIMED";
}

export interface ProductionReleaseAssessment {
  decision: ProductionReleaseDecision;
  stage: ReleaseTrafficStage;
  targetTrafficPercent: number;
  failedGates: string[];
  reasons: string[];
  evaluatedAt: string;
}

const allGateKeys = Object.freeze([...PRODUCTION_RELEASE_GATES]);

export function assessProductionRelease(
  evidence: ProductionReleaseEvidence,
  stage: ReleaseTrafficStage,
): ProductionReleaseAssessment {
  const failedGates: string[] = [];
  const reasons: string[] = [];
  const stageConfig = PRODUCTION_RELEASE_STAGES.find((item) => item.stage === stage);
  if (!stageConfig) {
    return {
      decision: "BLOCK",
      stage,
      targetTrafficPercent: 0,
      failedGates: ["stage-integrity"],
      reasons: [`Unknown release stage: ${stage}`],
      evaluatedAt: new Date().toISOString(),
    };
  }

  const checks: Record<string, boolean> = {
    "unified-certification": evidence.unifiedCertification,
    "release-identity": evidence.authenticatedIdentity,
    "candidate-readiness": evidence.candidateReady,
    "zero-traffic-deployment": evidence.zeroTrafficDeployed,
    "tenant-canary": evidence.tenantCanaryPassed,
    "health-readiness": evidence.healthPassed,
    "live-identity": evidence.liveIdentityMatched,
    synchronization: evidence.synchronizationPassed,
    "database-compatibility": evidence.databaseCompatibilityPassed,
    observability: evidence.observabilityPassed,
    performance: evidence.performancePassed,
    "rollback-readiness": evidence.rollbackReady,
    "kill-switch": evidence.killSwitchReady,
    "traffic-integrity": evidence.trafficIntegrityPassed,
    "audit-evidence": evidence.auditEvidencePresent,
  };

  for (const gate of allGateKeys) {
    if (!checks[gate]) {
      failedGates.push(gate);
      reasons.push(`Required production gate failed: ${gate}`);
    }
  }

  if (evidence.evidenceClass === "CLAIMED" || evidence.evidenceClass === "SIMULATED") {
    failedGates.push("evidence-classification");
    reasons.push("Simulated or claimed evidence cannot authorize production traffic.");
  }

  if (stageConfig.trafficPercent > 0 && !evidence.liveIdentityMatched) {
    failedGates.push("live-identity");
    reasons.push("Non-zero production traffic requires verified live release identity.");
  }

  const decision: ProductionReleaseDecision = failedGates.length > 0 ? "BLOCK" : "PASS";
  return {
    decision,
    stage,
    targetTrafficPercent: stageConfig.trafficPercent,
    failedGates: [...new Set(failedGates)],
    reasons: [...new Set(reasons)],
    evaluatedAt: new Date().toISOString(),
  };
}

export function nextProductionStage(stage: ReleaseTrafficStage): ReleaseTrafficStage {
  const index = PRODUCTION_RELEASE_STAGES.findIndex((item) => item.stage === stage);
  return index >= 0 && index < PRODUCTION_RELEASE_STAGES.length - 1
    ? PRODUCTION_RELEASE_STAGES[index + 1].stage
    : stage;
}

export function assertProductionPromotionAllowed(
  assessment: ProductionReleaseAssessment,
  requestedStage: ReleaseTrafficStage,
): void {
  if (assessment.decision !== "PASS") {
    throw new Error(`PRODUCTION_PROMOTION_BLOCKED: ${assessment.failedGates.join(", ")}`);
  }
  if (requestedStage !== assessment.stage) {
    throw new Error(`PRODUCTION_PROMOTION_BLOCKED: assessment stage ${assessment.stage} does not match requested stage ${requestedStage}`);
  }
}
