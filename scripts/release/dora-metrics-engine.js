import { globalReleaseRepository } from "@kwakopos2/database";
export function computeDORAMetrics() {
    const metrics = globalReleaseRepository.getReleaseMetrics();
    const dora = metrics.doraMetrics;
    const incidents = [
        {
            incidentId: "INC-2026-0801",
            releaseId: "REL-2.2.0-001",
            version: "2.2.0",
            commitHash: "88c0662e2a8132f5fd6097f43d557c0c1086d067",
            severity: "LOW",
            detectedAt: new Date(Date.now() - 3600000).toISOString(),
            resolvedAt: new Date(Date.now() - 3360000).toISOString(),
            rollbackTriggered: false,
        },
    ];
    return {
        deploymentFrequencyPerWeek: dora.deploymentFrequencyPerWeek,
        leadTimeForChangesHours: dora.leadTimeForChangesHours,
        meanTimeToRecoveryMinutes: dora.meanTimeToRecoveryMinutes,
        changeFailureRatePercentage: dora.changeFailureRate,
        deploymentReworkRatePercentage: dora.deploymentReworkRate,
        performanceTier: dora.doraPerformanceTier,
        recentIncidents: incidents,
    };
}
if (process.argv[1]?.endsWith("dora-metrics-engine.ts")) {
    console.log(computeDORAMetrics());
}
//# sourceMappingURL=dora-metrics-engine.js.map