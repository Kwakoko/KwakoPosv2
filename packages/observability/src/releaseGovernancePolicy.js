"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleaseGovernancePolicy = void 0;
class ReleaseGovernancePolicy {
    static freezeState = "NORMAL";
    static freezeReason;
    static freezeUpdatedBy;
    static freezeUpdatedAt = new Date().toISOString();
    static featureFlags = new Map([
        [
            "ff_distributed_tracing_v2",
            {
                flagKey: "ff_distributed_tracing_v2",
                description: "Enables OpenTelemetry W3C distributed tracing context across microservices",
                ownerEmail: "infra@kwakopos.com",
                targetRelease: "2.1.0",
                rolloutPercentage: 100,
                expirationDate: "2026-12-31",
                isEnabled: true,
                rollbackState: false,
                createdAt: "2026-08-20T00:00:00.000Z",
                updatedAt: new Date().toISOString(),
            },
        ],
        [
            "ff_rum_web_vitals",
            {
                flagKey: "ff_rum_web_vitals",
                description: "Enables client-side Real-User Monitoring Web Vitals collection in PWA",
                ownerEmail: "frontend@kwakopos.com",
                targetRelease: "2.1.0",
                rolloutPercentage: 100,
                expirationDate: "2026-12-31",
                isEnabled: true,
                rollbackState: false,
                createdAt: "2026-08-20T00:00:00.000Z",
                updatedAt: new Date().toISOString(),
            },
        ],
    ]);
    static drStatus = {
        lastSuccessfulBackup: new Date(Date.now() - 3600000).toISOString(),
        lastVerifiedRestore: new Date(Date.now() - 86400000).toISOString(),
        rpoMinutesActual: 15,
        rpoMinutesTarget: 60,
        rtoMinutesActual: 12,
        rtoMinutesTarget: 30,
        backupHealth: "HEALTHY",
        restoreDrillPassed: true,
        databaseSizeMb: 142.5,
        retentionDays: 30,
    };
    static getFreezeState() {
        return {
            state: this.freezeState,
            reason: this.freezeReason,
            updatedBy: this.freezeUpdatedBy,
            updatedAt: this.freezeUpdatedAt,
        };
    }
    static setFreezeState(state, reason, updatedBy) {
        this.freezeState = state;
        this.freezeReason = reason;
        this.freezeUpdatedBy = updatedBy;
        this.freezeUpdatedAt = new Date().toISOString();
    }
    static canDeployRelease(isEmergency = false) {
        if (this.freezeState === "FULL_LOCKDOWN") {
            return { allowed: false, reason: "FULL_LOCKDOWN: All releases and deployments are blocked by Super Admin." };
        }
        if (this.freezeState === "RELEASE_FREEZE" && !isEmergency) {
            return { allowed: false, reason: "RELEASE_FREEZE: Non-emergency releases are currently frozen." };
        }
        if (this.freezeState === "EMERGENCY_ONLY" && !isEmergency) {
            return { allowed: false, reason: "EMERGENCY_ONLY: Only emergency hotfixes are permitted." };
        }
        return { allowed: true, reason: "Release allowed under current governance policy." };
    }
    static getFeatureFlags() {
        return Array.from(this.featureFlags.values());
    }
    static updateFeatureFlag(flag) {
        this.featureFlags.set(flag.flagKey, {
            ...flag,
            updatedAt: new Date().toISOString(),
        });
    }
    static getDisasterRecoveryStatus() {
        return { ...this.drStatus };
    }
    static recordBackupVerification(success, durationMinutes) {
        this.drStatus.lastVerifiedRestore = new Date().toISOString();
        this.drStatus.rtoMinutesActual = durationMinutes;
        this.drStatus.restoreDrillPassed = success;
        this.drStatus.backupHealth = success ? "HEALTHY" : "CRITICAL";
    }
}
exports.ReleaseGovernancePolicy = ReleaseGovernancePolicy;
//# sourceMappingURL=releaseGovernancePolicy.js.map