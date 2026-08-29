"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleaseStateMachine = void 0;
class ReleaseStateMachine {
    static VALID_TRANSITIONS = {
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
    static canTransition(current, next) {
        const allowed = this.VALID_TRANSITIONS[current] || [];
        return allowed.includes(next);
    }
    static transition(lineage, next, reason) {
        if (!this.canTransition(lineage.state, next)) {
            throw new Error(`INVALID_RELEASE_STATE_TRANSITION: Cannot transition from ${lineage.state} to ${next}.`);
        }
        const updated = {
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
        }
        else if (next === "RELEASE_STABLE") {
            updated.stableAt = new Date().toISOString();
        }
        else if (next === "ROLLBACK_EXECUTED") {
            updated.trafficPercentage = 0;
            updated.rollbackEligible = false;
        }
        return updated;
    }
}
exports.ReleaseStateMachine = ReleaseStateMachine;
//# sourceMappingURL=releaseStateMachine.js.map