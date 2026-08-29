export type TenantHealthTier = "HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL";
export interface TenantHealthScore {
    tenantId: string;
    reliabilityScore: number;
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
export declare class TenantHealthScorer {
    computeTenantScore(params: {
        tenantId: string;
        apiSuccessRate: number;
        syncSuccessRate: number;
        inventoryIntegrity: number;
        medianLatencyMs: number;
        activeIncidentCount: number;
    }): TenantHealthScore;
}
export declare const globalTenantHealthScorer: TenantHealthScorer;
//# sourceMappingURL=tenantHealth.d.ts.map