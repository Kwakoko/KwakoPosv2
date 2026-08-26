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

export class RollbackController {
  public static checkRollbackCompatibility(
    currentMetadata: {
      databaseSchemaVersion: number;
      syncProtocolVersion: number;
      pwaSchemaVersion: number;
    },
    targetMetadata: {
      databaseSchemaVersion: number;
      syncProtocolVersion: number;
      pwaSchemaVersion: number;
    }
  ): RollbackCompatibilityCheck {
    const reasons: string[] = [];

    // Database schema backward compatibility
    const dbCompat = targetMetadata.databaseSchemaVersion <= currentMetadata.databaseSchemaVersion;
    if (!dbCompat) {
      reasons.push(
        `Database schema version mismatch: target requires v${targetMetadata.databaseSchemaVersion}, but current is v${currentMetadata.databaseSchemaVersion}.`
      );
    }

    // Sync protocol compatibility
    const syncCompat = targetMetadata.syncProtocolVersion === currentMetadata.syncProtocolVersion;
    if (!syncCompat) {
      reasons.push(
        `Sync protocol version mismatch: target uses protocol v${targetMetadata.syncProtocolVersion}, current uses v${currentMetadata.syncProtocolVersion}.`
      );
    }

    // PWA schema compatibility (cannot roll back to older schema if data was converted)
    const pwaCompat = targetMetadata.pwaSchemaVersion <= currentMetadata.pwaSchemaVersion;
    if (!pwaCompat) {
      reasons.push(
        `PWA schema version drift: target v${targetMetadata.pwaSchemaVersion} cannot read current v${currentMetadata.pwaSchemaVersion} IndexedDB state.`
      );
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

  public static async executeSafeRollback(options: {
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
  }): Promise<RollbackExecutionResult> {
    const startTime = Date.now();

    const compat = this.checkRollbackCompatibility(
      {
        databaseSchemaVersion: options.failedRelease.databaseSchemaVersion,
        syncProtocolVersion: options.failedRelease.syncProtocolVersion,
        pwaSchemaVersion: options.failedRelease.pwaSchemaVersion,
      },
      {
        databaseSchemaVersion: options.targetStableRelease.databaseSchemaVersion,
        syncProtocolVersion: options.targetStableRelease.syncProtocolVersion,
        pwaSchemaVersion: options.targetStableRelease.pwaSchemaVersion,
      }
    );

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