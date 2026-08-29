"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanaryController = exports.DEFAULT_CANARY_POLICY = void 0;
exports.DEFAULT_CANARY_POLICY = {
    stages: [
        { trafficPercentage: 0, minObservationMinutes: 0 },
        { trafficPercentage: 1, minObservationMinutes: 2 },
        { trafficPercentage: 5, minObservationMinutes: 5 },
        { trafficPercentage: 25, minObservationMinutes: 10 },
        { trafficPercentage: 50, minObservationMinutes: 15 },
        { trafficPercentage: 100, minObservationMinutes: 30 },
    ],
    maxErrorRate: 0.005,
    maxP95LatencyMs: 500,
    maxSyncFailureRate: 0.01,
    maxInventoryAnomalies: 0,
};
class CanaryController {
    policy;
    currentStageIndex = 0;
    stages;
    constructor(policy = exports.DEFAULT_CANARY_POLICY) {
        this.policy = policy;
        this.stages = policy.stages.map((s, idx) => ({
            stageIndex: idx,
            trafficPercentage: s.trafficPercentage,
            minObservationMinutes: s.minObservationMinutes,
            status: idx === 0 ? "PASSED" : "PENDING",
        }));
    }
    getCurrentStage() {
        return this.stages[this.currentStageIndex];
    }
    getAllStages() {
        return [...this.stages];
    }
    evaluateStageHealth(metrics) {
        const current = this.stages[this.currentStageIndex];
        current.evaluatedAt = new Date().toISOString();
        current.metricsSnapshot = metrics;
        if (metrics.inventoryAnomalies > this.policy.maxInventoryAnomalies) {
            current.status = "FAILED";
            return {
                passed: false,
                reason: `CRITICAL_DATA_INTEGRITY: ${metrics.inventoryAnomalies} inventory anomalies detected during canary stage ${current.trafficPercentage}%.`,
            };
        }
        if (metrics.syntheticFailures > 0) {
            current.status = "FAILED";
            return {
                passed: false,
                reason: `SYNTHETIC_REGRESSION: ${metrics.syntheticFailures} synthetic monitoring failures during canary stage.`,
            };
        }
        if (metrics.errorRate > this.policy.maxErrorRate) {
            current.status = "FAILED";
            return {
                passed: false,
                reason: `HIGH_ERROR_RATE: Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold ${(this.policy.maxErrorRate * 100).toFixed(2)}%.`,
            };
        }
        if (metrics.p95LatencyMs > this.policy.maxP95LatencyMs) {
            current.status = "FAILED";
            return {
                passed: false,
                reason: `LATENCY_DEGRADATION: P95 latency ${metrics.p95LatencyMs}ms exceeds SLA limit ${this.policy.maxP95LatencyMs}ms.`,
            };
        }
        if (metrics.syncFailureRate > this.policy.maxSyncFailureRate) {
            current.status = "FAILED";
            return {
                passed: false,
                reason: `SYNC_DEGRADATION: Sync failure rate ${(metrics.syncFailureRate * 100).toFixed(2)}% exceeds threshold ${(this.policy.maxSyncFailureRate * 100).toFixed(2)}%.`,
            };
        }
        current.status = "PASSED";
        return { passed: true, reason: `Canary stage ${current.trafficPercentage}% healthy and compliant.` };
    }
    advanceStage() {
        const current = this.stages[this.currentStageIndex];
        if (current.status !== "PASSED" && current.stageIndex !== 0) {
            return {
                advanced: false,
                newTrafficPercentage: current.trafficPercentage,
                message: `Cannot advance canary stage. Current stage ${current.trafficPercentage}% status is ${current.status}.`,
            };
        }
        if (this.currentStageIndex >= this.stages.length - 1) {
            return {
                advanced: false,
                newTrafficPercentage: 100,
                message: "Canary already at 100% production traffic.",
            };
        }
        this.currentStageIndex += 1;
        const nextStage = this.stages[this.currentStageIndex];
        nextStage.status = "ACTIVE";
        nextStage.startedAt = new Date().toISOString();
        return {
            advanced: true,
            newTrafficPercentage: nextStage.trafficPercentage,
            message: `Canary advanced to ${nextStage.trafficPercentage}% traffic.`,
        };
    }
}
exports.CanaryController = CanaryController;
//# sourceMappingURL=canaryController.js.map