export interface ComponentHealthStatus {
    name: string;
    score: number;
    weight: number;
    status: "GREEN" | "YELLOW" | "RED";
    metrics: Record<string, any>;
    issues: string[];
}
export interface PlatformHealthOverview {
    overallScore: number;
    overallStatus: "GREEN" | "YELLOW" | "RED";
    evaluatedAt: string;
    appVersion: string;
    cloudRunRevision: string;
    zeroToleranceBreach: boolean;
    breachReason?: string;
    components: {
        availability: ComponentHealthStatus;
        apiReliability: ComponentHealthStatus;
        syncReliability: ComponentHealthStatus;
        inventoryIntegrity: ComponentHealthStatus;
        rumPerformance: ComponentHealthStatus;
        databaseHealth: ComponentHealthStatus;
        securityHealth: ComponentHealthStatus;
        syntheticMonitoring: ComponentHealthStatus;
    };
    activeIncidentsCount: number;
}
export declare class PlatformHealthEvaluator {
    static evaluateGlobalPlatformHealth(inputs: {
        appVersion: string;
        cloudRunRevision: string;
        availabilityPct: number;
        apiSuccessPct: number;
        syncSuccessPct: number;
        inventoryDivergencesCount: number;
        orphanAdjustmentsCount: number;
        tenantIsolationViolationsCount: number;
        p95LatencyMs: number;
        rumLcpMs: number;
        dbConnectionHealth: "HEALTHY" | "DEGRADED" | "CRITICAL";
        syntheticTestsPassed: boolean;
        activeIncidentsCount: number;
    }): PlatformHealthOverview;
}
//# sourceMappingURL=platformHealthEvaluator.d.ts.map