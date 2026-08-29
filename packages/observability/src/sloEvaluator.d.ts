export interface SloTarget {
    name: string;
    targetPercent: number;
    currentPercent: number;
    status: "COMPLIANT" | "AT_RISK" | "BREACHED";
}
export interface SloReport {
    overallCompliance: "PASS" | "FAIL";
    evaluatedAt: string;
    targets: {
        availability: SloTarget;
        apiSuccessRate: SloTarget;
        syncSuccessRate: SloTarget;
        latencyP95: {
            name: string;
            thresholdMs: number;
            currentP95Ms: number;
            status: "COMPLIANT" | "AT_RISK" | "BREACHED";
        };
        inventoryIntegrity: SloTarget;
        tenantIsolationViolations: {
            name: string;
            maxAllowed: number;
            currentViolations: number;
            status: "COMPLIANT" | "BREACHED";
        };
        dataLossIncidents: {
            name: string;
            maxAllowed: number;
            currentCount: number;
            status: "COMPLIANT" | "BREACHED";
        };
    };
}
export declare class SloEvaluator {
    evaluateProductionSlos(params: {
        availabilityPercent: number;
        apiSuccessPercent: number;
        syncSuccessPercent: number;
        currentP95LatencyMs: number;
        inventoryIntegrityPercent: number;
        tenantIsolationViolationCount: number;
        dataLossIncidentCount: number;
    }): SloReport;
}
export declare const globalSloEvaluator: SloEvaluator;
//# sourceMappingURL=sloEvaluator.d.ts.map