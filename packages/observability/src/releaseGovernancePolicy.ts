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

export class ReleaseGovernancePolicy {
  private static freezeState: FreezeState = "NORMAL";
  private static freezeReason?: string;
  private static freezeUpdatedBy?: string;
  private static freezeUpdatedAt: string = new Date().toISOString();

  private static featureFlags: Map<string, FeatureFlagGovernance> = new Map([
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

  private static drStatus: DisasterRecoveryStatus = {
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

  public static getFreezeState(): {
    state: FreezeState;
    reason?: string;
    updatedBy?: string;
    updatedAt: string;
  } {
    return {
      state: this.freezeState,
      reason: this.freezeReason,
      updatedBy: this.freezeUpdatedBy,
      updatedAt: this.freezeUpdatedAt,
    };
  }

  public static setFreezeState(state: FreezeState, reason?: string, updatedBy?: string) {
    this.freezeState = state;
    this.freezeReason = reason;
    this.freezeUpdatedBy = updatedBy;
    this.freezeUpdatedAt = new Date().toISOString();
  }

  public static canDeployRelease(isEmergency: boolean = false): { allowed: boolean; reason: string } {
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

  public static getFeatureFlags(): FeatureFlagGovernance[] {
    return Array.from(this.featureFlags.values());
  }

  public static updateFeatureFlag(flag: FeatureFlagGovernance) {
    this.featureFlags.set(flag.flagKey, {
      ...flag,
      updatedAt: new Date().toISOString(),
    });
  }

  public static getDisasterRecoveryStatus(): DisasterRecoveryStatus {
    return { ...this.drStatus };
  }

  public static recordBackupVerification(success: boolean, durationMinutes: number) {
    this.drStatus.lastVerifiedRestore = new Date().toISOString();
    this.drStatus.rtoMinutesActual = durationMinutes;
    this.drStatus.restoreDrillPassed = success;
    this.drStatus.backupHealth = success ? "HEALTHY" : "CRITICAL";
  }
}