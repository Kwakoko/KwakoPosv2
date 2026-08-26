export type TenantHealthTier = "HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL";

export interface TenantHealthScore {
  tenantId: string;
  reliabilityScore: number; // 0 - 100
  healthTier: TenantHealthTier;
  metrics: {
    apiSuccessRate: number;
    syncSuccessRate: number;
    inventoryIntegrity: number;
    medianLatencyMs: number;
    activeIncidentCount: number;
  };
  lastEvaluatedAt: string;
}

export class TenantHealthScorer {
  computeTenantScore(params: {
    tenantId: string;
    apiSuccessRate: number; // e.g. 99.8
    syncSuccessRate: number; // e.g. 100
    inventoryIntegrity: number; // e.g. 100
    medianLatencyMs: number; // e.g. 45
    activeIncidentCount: number;
  }): TenantHealthScore {
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

    let tier: TenantHealthTier = "HEALTHY";
    if (clampedScore < 60) tier = "CRITICAL";
    else if (clampedScore < 80) tier = "AT_RISK";
    else if (clampedScore < 95) tier = "DEGRADED";

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

export const globalTenantHealthScorer = new TenantHealthScorer();