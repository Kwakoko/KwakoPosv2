"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalTenantHealthScorer = exports.TenantHealthScorer = void 0;
class TenantHealthScorer {
    computeTenantScore(params) {
        let score = 100;
        // API error deductions
        const apiFailureRate = Math.max(0, 100 - params.apiSuccessRate);
        score -= apiFailureRate * 5;
        // Sync error deductions
        const syncFailureRate = Math.max(0, 100 - params.syncSuccessRate);
        score -= syncFailureRate * 8;
        // Inventory integrity deductions
        const invFailure = Math.max(0, 100 - params.inventoryIntegrity);
        score -= invFailure * 10;
        // Latency penalty
        if (params.medianLatencyMs > 500) {
            score -= Math.min(20, (params.medianLatencyMs - 500) / 50);
        }
        // Incident penalties
        score -= params.activeIncidentCount * 15;
        const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
        let tier = "HEALTHY";
        if (clampedScore < 60)
            tier = "CRITICAL";
        else if (clampedScore < 80)
            tier = "AT_RISK";
        else if (clampedScore < 95)
            tier = "DEGRADED";
        return {
            tenantId: params.tenantId,
            reliabilityScore: clampedScore,
            healthTier: tier,
            metrics: {
                apiSuccessRate: params.apiSuccessRate,
                syncSuccessRate: params.syncSuccessRate,
                inventoryIntegrity: params.inventoryIntegrity,
                medianLatencyMs: params.medianLatencyMs,
                activeIncidentCount: params.activeIncidentCount,
            },
            lastEvaluatedAt: new Date().toISOString(),
        };
    }
}
exports.TenantHealthScorer = TenantHealthScorer;
exports.globalTenantHealthScorer = new TenantHealthScorer();
//# sourceMappingURL=tenantHealth.js.map