export type FreezeState = "NORMAL" | "RELEASE_FREEZE" | "EMERGENCY_ONLY" | "FULL_LOCKDOWN";
export interface FeatureFlagGovernance {
    flagKey: string;
    description: string;
    ownerEmail: string;
    targetRelease: string;
    rolloutPercentage: number;
    targetedTenants?: string[];
    expirationDate: string;
    isEnabled: boolean;
    rollbackState: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface DisasterRecoveryStatus {
    lastSuccessfulBackup: string;
    lastVerifiedRestore: string;
    rpoMinutesActual: number;
    rpoMinutesTarget: number;
    rtoMinutesActual: number;
    rtoMinutesTarget: number;
    backupHealth: "HEALTHY" | "DEGRADED" | "CRITICAL";
    restoreDrillPassed: boolean;
    databaseSizeMb: number;
    retentionDays: number;
}
export declare class ReleaseGovernancePolicy {
    private static freezeState;
    private static freezeReason?;
    private static freezeUpdatedBy?;
    private static freezeUpdatedAt;
    private static featureFlags;
    private static drStatus;
    static getFreezeState(): {
        state: FreezeState;
        reason?: string;
        updatedBy?: string;
        updatedAt: string;
    };
    static setFreezeState(state: FreezeState, reason?: string, updatedBy?: string): void;
    static canDeployRelease(isEmergency?: boolean): {
        allowed: boolean;
        reason: string;
    };
    static getFeatureFlags(): FeatureFlagGovernance[];
    static updateFeatureFlag(flag: FeatureFlagGovernance): void;
    static getDisasterRecoveryStatus(): DisasterRecoveryStatus;
    static recordBackupVerification(success: boolean, durationMinutes: number): void;
}
//# sourceMappingURL=releaseGovernancePolicy.d.ts.map