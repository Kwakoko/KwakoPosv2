"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollbackController = void 0;
class RollbackController {
    static checkRollbackCompatibility(currentMetadata, targetMetadata) {
        const reasons = [];
        // Database schema backward compatibility
        const dbCompat = targetMetadata.databaseSchemaVersion <= currentMetadata.databaseSchemaVersion;
        if (!dbCompat) {
            reasons.push(`Database schema version mismatch: target requires v${targetMetadata.databaseSchemaVersion}, but current is v${currentMetadata.databaseSchemaVersion}.`);
        }
        // Sync protocol compatibility
        const syncCompat = targetMetadata.syncProtocolVersion === currentMetadata.syncProtocolVersion;
        if (!syncCompat) {
            reasons.push(`Sync protocol version mismatch: target uses protocol v${targetMetadata.syncProtocolVersion}, current uses v${currentMetadata.syncProtocolVersion}.`);
        }
        // PWA schema compatibility (cannot roll back to older schema if data was converted)
        const pwaCompat = targetMetadata.pwaSchemaVersion <= currentMetadata.pwaSchemaVersion;
        if (!pwaCompat) {
            reasons.push(`PWA schema version drift: target v${targetMetadata.pwaSchemaVersion} cannot read current v${currentMetadata.pwaSchemaVersion} IndexedDB state.`);
        }
        const isCompatible = reasons.length === 0;
        return {
            isCompatible,
            databaseSchemaCompatible: dbCompat,
            syncProtocolCompatible: syncCompat,
            pwaSchemaCompatible: pwaCompat,
            reasons,
        };
    }
    static async executeSafeRollback(options) {
        const startTime = Date.now();
        const compat = this.checkRollbackCompatibility({
            databaseSchemaVersion: options.failedRelease.databaseSchemaVersion,
            syncProtocolVersion: options.failedRelease.syncProtocolVersion,
            pwaSchemaVersion: options.failedRelease.pwaSchemaVersion,
        }, {
            databaseSchemaVersion: options.targetStableRelease.databaseSchemaVersion,
            syncProtocolVersion: options.targetStableRelease.syncProtocolVersion,
            pwaSchemaVersion: options.targetStableRelease.pwaSchemaVersion,
        });
        if (!compat.isCompatible) {
            return {
                success: false,
                failedReleaseId: options.failedRelease.id,
                targetRevision: options.targetStableRelease.cloudRunRevision,
                executedAt: new Date().toISOString(),
                compatibilityCheck: compat,
                trafficRestored: false,
                healthVerified: false,
                incidentId: options.incidentId,
                evidence: {
                    targetVersion: options.targetStableRelease.appVersion,
                    targetRevision: options.targetStableRelease.cloudRunRevision,
                    previousRevision: options.failedRelease.cloudRunRevision,
                    durationMs: Date.now() - startTime,
                },
            };
        }
        let trafficRestored = true;
        if (options.trafficSwitchFn) {
            trafficRestored = await options.trafficSwitchFn(options.targetStableRelease.cloudRunRevision);
        }
        let healthVerified = true;
        if (options.healthVerifyFn) {
            healthVerified = await options.healthVerifyFn(options.targetStableRelease.cloudRunRevision);
        }
        const success = trafficRestored && healthVerified;
        return {
            success,
            failedReleaseId: options.failedRelease.id,
            targetRevision: options.targetStableRelease.cloudRunRevision,
            executedAt: new Date().toISOString(),
            compatibilityCheck: compat,
            trafficRestored,
            healthVerified,
            incidentId: options.incidentId,
            evidence: {
                targetVersion: options.targetStableRelease.appVersion,
                targetRevision: options.targetStableRelease.cloudRunRevision,
                previousRevision: options.failedRelease.cloudRunRevision,
                durationMs: Date.now() - startTime,
            },
        };
    }
}
exports.RollbackController = RollbackController;
//# sourceMappingURL=rollbackController.js.map