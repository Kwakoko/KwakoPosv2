"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformHealthEvaluator = void 0;
class PlatformHealthEvaluator {
    static evaluateGlobalPlatformHealth(inputs) {
        const compAvailability = {
            name: "Availability",
            score: inputs.availabilityPct,
            weight: 0.2,
            status: inputs.availabilityPct >= 99.9 ? "GREEN" : inputs.availabilityPct >= 99.0 ? "YELLOW" : "RED",
            metrics: { availabilityPct: inputs.availabilityPct },
            issues: inputs.availabilityPct < 99.9 ? [`Availability ${inputs.availabilityPct}% below 99.9% SLO.`] : [],
        };
        const compApi = {
            name: "API Reliability",
            score: inputs.apiSuccessPct,
            weight: 0.15,
            status: inputs.apiSuccessPct >= 99.5 ? "GREEN" : inputs.apiSuccessPct >= 98.0 ? "YELLOW" : "RED",
            metrics: { apiSuccessPct: inputs.apiSuccessPct, p95LatencyMs: inputs.p95LatencyMs },
            issues: inputs.apiSuccessPct < 99.5 ? [`API success rate ${inputs.apiSuccessPct}% below 99.5% SLO.`] : [],
        };
        const compSync = {
            name: "Sync Reliability",
            score: inputs.syncSuccessPct,
            weight: 0.2,
            status: inputs.syncSuccessPct >= 99.9 ? "GREEN" : inputs.syncSuccessPct >= 98.0 ? "YELLOW" : "RED",
            metrics: { syncSuccessPct: inputs.syncSuccessPct },
            issues: inputs.syncSuccessPct < 99.9 ? [`Sync success rate ${inputs.syncSuccessPct}% below 99.9% SLO.`] : [],
        };
        const inventoryIntegrityPassed = inputs.inventoryDivergencesCount === 0 && inputs.orphanAdjustmentsCount === 0;
        const compInventory = {
            name: "Inventory Integrity",
            score: inventoryIntegrityPassed ? 100 : 0,
            weight: 0.2,
            status: inventoryIntegrityPassed ? "GREEN" : "RED",
            metrics: {
                inventoryDivergencesCount: inputs.inventoryDivergencesCount,
                orphanAdjustmentsCount: inputs.orphanAdjustmentsCount,
            },
            issues: inventoryIntegrityPassed
                ? []
                : [
                    `CRITICAL DATA INTEGRITY: ${inputs.inventoryDivergencesCount} stock divergences and ${inputs.orphanAdjustmentsCount} orphan adjustments detected.`,
                ],
        };
        const rumScore = inputs.rumLcpMs <= 2500 ? 100 : inputs.rumLcpMs <= 4000 ? 70 : 30;
        const compRum = {
            name: "RUM Performance",
            score: rumScore,
            weight: 0.1,
            status: rumScore >= 90 ? "GREEN" : rumScore >= 60 ? "YELLOW" : "RED",
            metrics: { rumLcpMs: inputs.rumLcpMs },
            issues: rumScore < 90 ? [`RUM LCP ${inputs.rumLcpMs}ms exceeds 2.5s threshold.`] : [],
        };
        const dbScore = inputs.dbConnectionHealth === "HEALTHY" ? 100 : inputs.dbConnectionHealth === "DEGRADED" ? 60 : 0;
        const compDb = {
            name: "Database Health",
            score: dbScore,
            weight: 0.05,
            status: inputs.dbConnectionHealth === "HEALTHY" ? "GREEN" : inputs.dbConnectionHealth === "DEGRADED" ? "YELLOW" : "RED",
            metrics: { dbConnectionHealth: inputs.dbConnectionHealth },
            issues: inputs.dbConnectionHealth !== "HEALTHY" ? [`Database connection state is ${inputs.dbConnectionHealth}.`] : [],
        };
        const securityPassed = inputs.tenantIsolationViolationsCount === 0;
        const compSec = {
            name: "Security & Isolation",
            score: securityPassed ? 100 : 0,
            weight: 0.05,
            status: securityPassed ? "GREEN" : "RED",
            metrics: { tenantIsolationViolationsCount: inputs.tenantIsolationViolationsCount },
            issues: securityPassed ? [] : [`CRITICAL: ${inputs.tenantIsolationViolationsCount} tenant isolation violations.`],
        };
        const compSynth = {
            name: "Synthetic Monitoring",
            score: inputs.syntheticTestsPassed ? 100 : 0,
            weight: 0.05,
            status: inputs.syntheticTestsPassed ? "GREEN" : "RED",
            metrics: { syntheticTestsPassed: inputs.syntheticTestsPassed },
            issues: inputs.syntheticTestsPassed ? [] : ["Synthetic monitoring tests failed."],
        };
        let weightedScore = compAvailability.score * compAvailability.weight +
            compApi.score * compApi.weight +
            compSync.score * compSync.weight +
            compInventory.score * compInventory.weight +
            compRum.score * compRum.weight +
            compDb.score * compDb.weight +
            compSec.score * compSec.weight +
            compSynth.score * compSynth.weight;
        let overallStatus = weightedScore >= 90 ? "GREEN" : weightedScore >= 70 ? "YELLOW" : "RED";
        // ZERO-TOLERANCE RULES: Inventory divergence or tenant breach immediately forces RED
        let zeroToleranceBreach = false;
        let breachReason = undefined;
        if (!inventoryIntegrityPassed) {
            zeroToleranceBreach = true;
            overallStatus = "RED";
            weightedScore = Math.min(weightedScore, 40);
            breachReason = "INVENTORY_INTEGRITY_BREACH: Zero tolerance rule triggered by stock divergence.";
        }
        else if (!securityPassed) {
            zeroToleranceBreach = true;
            overallStatus = "RED";
            weightedScore = Math.min(weightedScore, 30);
            breachReason = "SECURITY_ISOLATION_BREACH: Zero tolerance rule triggered by tenant boundary violation.";
        }
        return {
            overallScore: Math.round(weightedScore),
            overallStatus,
            evaluatedAt: new Date().toISOString(),
            appVersion: inputs.appVersion,
            cloudRunRevision: inputs.cloudRunRevision,
            zeroToleranceBreach,
            breachReason,
            components: {
                availability: compAvailability,
                apiReliability: compApi,
                syncReliability: compSync,
                inventoryIntegrity: compInventory,
                rumPerformance: compRum,
                databaseHealth: compDb,
                securityHealth: compSec,
                syntheticMonitoring: compSynth,
            },
            activeIncidentsCount: inputs.activeIncidentsCount,
        };
    }
}
exports.PlatformHealthEvaluator = PlatformHealthEvaluator;
//# sourceMappingURL=platformHealthEvaluator.js.map