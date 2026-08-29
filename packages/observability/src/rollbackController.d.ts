export interface RollbackCompatibilityCheck {
    isCompatible: boolean;
    databaseSchemaCompatible: boolean;
    syncProtocolCompatible: boolean;
    pwaSchemaCompatible: boolean;
    reasons: string[];
}
export interface RollbackExecutionResult {
    success: boolean;
    failedReleaseId: string;
    targetRevision: string;
    executedAt: string;
    compatibilityCheck: RollbackCompatibilityCheck;
    trafficRestored: boolean;
    healthVerified: boolean;
    incidentId?: string;
    evidence: {
        targetVersion: string;
        targetRevision: string;
        previousRevision: string;
        durationMs: number;
    };
}
export declare class RollbackController {
    static checkRollbackCompatibility(currentMetadata: {
        databaseSchemaVersion: number;
        syncProtocolVersion: number;
        pwaSchemaVersion: number;
    }, targetMetadata: {
        databaseSchemaVersion: number;
        syncProtocolVersion: number;
        pwaSchemaVersion: number;
    }): RollbackCompatibilityCheck;
    static executeSafeRollback(options: {
        failedRelease: {
            id: string;
            appVersion: string;
            cloudRunRevision: string;
            databaseSchemaVersion: number;
            syncProtocolVersion: number;
            pwaSchemaVersion: number;
        };
        targetStableRelease: {
            id: string;
            appVersion: string;
            cloudRunRevision: string;
            databaseSchemaVersion: number;
            syncProtocolVersion: number;
            pwaSchemaVersion: number;
        };
        trafficSwitchFn?: (targetRevision: string) => Promise<boolean>;
        healthVerifyFn?: (targetRevision: string) => Promise<boolean>;
        incidentId?: string;
    }): Promise<RollbackExecutionResult>;
}
//# sourceMappingURL=rollbackController.d.ts.map