export type ReleaseState =
  | "DRAFT"
  | "VERSIONED"
  | "BUILT"
  | "CANDIDATE_DEPLOYED"
  | "CERTIFICATION_PENDING"
  | "CERTIFIED"
  | "CANARY"
  | "CANARY_HEALTHY"
  | "PRODUCTION_PROMOTION"
  | "LIVE"
  | "MONITORING"
  | "RELEASE_HEALTHY"
  | "RELEASE_STABLE"
  | "CERTIFICATION_FAILED"
  | "DEPLOYMENT_FAILED"
  | "CANARY_FAILED"
  | "HEALTH_DEGRADED"
  | "ROLLBACK_REQUESTED"
  | "ROLLBACK_EXECUTED"
  | "ROLLBACK_VERIFIED";

export interface ReleaseLineage {
  releaseId: string;
  appVersion: string;
  gitTag: string;
  gitSha: string;
  containerDigest: string;
  cloudRunRevision: string;
  state: ReleaseState;
  trafficPercentage: number;
  certificationStatus: "PENDING" | "PASS" | "FAIL";
  healthStatus: "GREEN" | "YELLOW" | "RED";
  canaryStage?: string;
  createdAt: string;
  promotedAt?: string;
  stableAt?: string;
  rollbackEligible: boolean;
  rollbackTargetRevision?: string;
  stateHistory: Array<{
    state: ReleaseState;
    timestamp: string;
    reason?: string;
  }>;
}

export class ReleaseStateMachine {
  private static VALID_TRANSITIONS: Record<ReleaseState, ReleaseState[]> = {
    DRAFT: ["VERSIONED"],
    VERSIONED: ["BUILT", "DEPLOYMENT_FAILED"],
    BUILT: ["CANDIDATE_DEPLOYED", "DEPLOYMENT_FAILED"],
    CANDIDATE_DEPLOYED: ["CERTIFICATION_PENDING", "DEPLOYMENT_FAILED"],
    CERTIFICATION_PENDING: ["CERTIFIED", "CERTIFICATION_FAILED"],
    CERTIFICATION_FAILED: ["DRAFT", "VERSIONED"],
    DEPLOYMENT_FAILED: ["DRAFT", "VERSIONED"],
    CERTIFIED: ["CANARY", "PRODUCTION_PROMOTION", "ROLLBACK_REQUESTED"],
    CANARY: ["CANARY_HEALTHY", "CANARY_FAILED", "ROLLBACK_REQUESTED"],
    CANARY_FAILED: ["ROLLBACK_REQUESTED", "ROLLBACK_EXECUTED"],
    CANARY_HEALTHY: ["PRODUCTION_PROMOTION", "CANARY", "ROLLBACK_REQUESTED"],
    PRODUCTION_PROMOTION: ["LIVE", "DEPLOYMENT_FAILED", "ROLLBACK_REQUESTED"],
    LIVE: ["MONITORING", "HEALTH_DEGRADED", "ROLLBACK_REQUESTED"],
    MONITORING: ["RELEASE_HEALTHY", "HEALTH_DEGRADED", "ROLLBACK_REQUESTED"],
    RELEASE_HEALTHY: ["RELEASE_STABLE", "HEALTH_DEGRADED", "ROLLBACK_REQUESTED"],
    RELEASE_STABLE: ["HEALTH_DEGRADED", "ROLLBACK_REQUESTED"],
    HEALTH_DEGRADED: ["ROLLBACK_REQUESTED", "MONITORING"],
    ROLLBACK_REQUESTED: ["ROLLBACK_EXECUTED"],
    ROLLBACK_EXECUTED: ["ROLLBACK_VERIFIED"],
    ROLLBACK_VERIFIED: [],
  };

  public static canTransition(current: ReleaseState, next: ReleaseState): boolean {
    const allowed = this.VALID_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  public static transition(lineage: ReleaseLineage, next: ReleaseState, reason?: string): ReleaseLineage {
    if (!this.canTransition(lineage.state, next)) {
      throw new Error(`INVALID_RELEASE_STATE_TRANSITION: Cannot transition from ${lineage.state} to ${next}.`);
    }

    const updated: ReleaseLineage = {
      ...lineage,
      state: next,
      stateHistory: [
        ...lineage.stateHistory,
        {
          state: next,
          timestamp: new Date().toISOString(),
          reason,
        },
      ],
    };

    if (next === "PRODUCTION_PROMOTION" || next === "LIVE") {
      updated.promotedAt = new Date().toISOString();
      updated.trafficPercentage = 100;
    } else if (next === "RELEASE_STABLE") {
      updated.stableAt = new Date().toISOString();
    } else if (next === "ROLLBACK_EXECUTED") {
      updated.trafficPercentage = 0;
      updated.rollbackEligible = false;
    }

    return updated;
  }
}