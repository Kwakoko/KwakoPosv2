export class ProgressiveDeliveryController {
    config;
    rolloutLog;
    constructor(version = "2.2.0") {
        this.config = {
            version,
            strategy: "CANARY",
            currentStage: "INTERNAL",
            trafficPercentage: 0,
            internalTenants: ["TENANT-INTERNAL-HQ", "TENANT-QA-001"],
            canaryTenants: ["TENANT-BETA-001", "TENANT-BETA-002"],
            haltOnTenantErrorRatePct: 1.0,
        };
        this.rolloutLog = [];
    }
    getStatus() {
        return { ...this.config, history: this.rolloutLog };
    }
    isTenantEligibleForVersion(tenantId) {
        if (this.config.currentStage === "PERCENT_100")
            return true;
        if (this.config.internalTenants.includes(tenantId))
            return true;
        if (this.config.currentStage !== "INTERNAL" && this.config.canaryTenants.includes(tenantId))
            return true;
        // Hash-based deterministic tenant bucket evaluation
        let hash = 0;
        for (let i = 0; i < tenantId.length; i++) {
            hash = (hash << 5) - hash + tenantId.charCodeAt(i);
            hash |= 0;
        }
        const bucket = Math.abs(hash) % 100;
        return bucket < this.config.trafficPercentage;
    }
    promoteStage() {
        const stages = [
            { stage: "INTERNAL", pct: 0 },
            { stage: "CANARY_TENANT", pct: 0 },
            { stage: "PERCENT_1", pct: 1 },
            { stage: "PERCENT_5", pct: 5 },
            { stage: "PERCENT_25", pct: 25 },
            { stage: "PERCENT_50", pct: 50 },
            { stage: "PERCENT_100", pct: 100 },
        ];
        const idx = stages.findIndex((s) => s.stage === this.config.currentStage);
        if (idx < stages.length - 1) {
            const next = stages[idx + 1];
            this.config.currentStage = next.stage;
            this.config.trafficPercentage = next.pct;
            this.rolloutLog.push({
                timestamp: new Date().toISOString(),
                stage: next.stage,
                trafficPct: next.pct,
                status: "PROMOTED",
            });
            console.log(` ✓ [PROGRESSIVE DELIVERY] Promoted to ${next.stage} (${next.pct}% traffic)`);
        }
        return {
            success: true,
            newStage: this.config.currentStage,
            trafficPercentage: this.config.trafficPercentage,
        };
    }
    haltRollout(reason) {
        this.config.trafficPercentage = 0;
        this.config.currentStage = "INTERNAL";
        this.rolloutLog.push({
            timestamp: new Date().toISOString(),
            stage: "HALTED",
            trafficPct: 0,
            status: `HALTED: ${reason}`,
        });
        console.error(` ❌ [PROGRESSIVE DELIVERY HALTED] ${reason}`);
        return { status: "HALTED", reason };
    }
}
//# sourceMappingURL=progressive-delivery-controller.js.map