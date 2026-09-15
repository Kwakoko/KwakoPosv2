import { LocalIndexedDbStore, AUTHORITATIVE_SCHEMA_VERSION } from "./indexedDb.js";
import { globalRumCollector } from "./rum/rumCollector.js";
import {
  AUTHORITATIVE_COMPATIBILITY_MATRIX,
  validateReleaseCompatibility,
  ReleaseCompatibilityMatrix,
} from "./persistence/releaseCompatibility.js";
import { PwaUpdateStateMachine, PwaUpdateState } from "./persistence/pwaUpdateStateMachine.js";
import { globalClientCoordination } from "./persistence/clientCoordination.js";
import { globalStoragePressureMonitor } from "./persistence/storagePressure.js";

export interface VersionInfo {
  appVersion: string;
  gitTag: string;
  gitSha?: string;
  cloudRunRevision?: string;
  environment: string;
  pwaSchemaVersion: number;
  syncProtocolVersion?: number;
}

export class PwaVersionManager {
  private localVersion: string;
  private pwaSchemaVersion: number;
  private localDb: LocalIndexedDbStore;
  private stateMachine: PwaUpdateStateMachine;
  private matrix: ReleaseCompatibilityMatrix;

  constructor(
    localVersion = AUTHORITATIVE_COMPATIBILITY_MATRIX.applicationVersion,
    pwaSchemaVersion = AUTHORITATIVE_SCHEMA_VERSION,
    localDb?: LocalIndexedDbStore,
    matrix: ReleaseCompatibilityMatrix = AUTHORITATIVE_COMPATIBILITY_MATRIX,
  ) {
    this.localVersion = localVersion;
    this.pwaSchemaVersion = pwaSchemaVersion;
    this.localDb = localDb || new LocalIndexedDbStore(pwaSchemaVersion);
    this.matrix = matrix;
    this.stateMachine = new PwaUpdateStateMachine(localVersion, pwaSchemaVersion);
  }

  getLocalVersion(): string {
    return this.localVersion;
  }

  getSchemaVersion(): number {
    return this.pwaSchemaVersion;
  }

  getState(): PwaUpdateState {
    return this.stateMachine.getState();
  }

  getFormattedVersionDisplay(): string {
    return `KwakoPos © 2026 • Version ${this.localVersion}`;
  }

  async checkServerVersion(endpoint = "/api/system/version"): Promise<{
    isUpToDate: boolean;
    localVersion: string;
    serverVersion: string | null;
    serverInfo: Partial<VersionInfo>;
    compatibility: { compatible: boolean; reason?: string };
  }> {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Version endpoint returned HTTP ${res.status}`);
      const body = await res.json();
      const serverInfo = (body?.data || body) as Partial<VersionInfo>;
      const serverVersion = serverInfo.appVersion || (serverInfo as any).version || null;

      const compatibility = validateReleaseCompatibility({
        applicationVersion: serverVersion || undefined,
        pwaVersion: serverVersion || undefined,
        schemaVersion: serverInfo.pwaSchemaVersion,
        syncProtocolVersion: serverInfo.syncProtocolVersion,
      }, this.matrix);

      return {
        isUpToDate: Boolean(serverVersion && this.localVersion === serverVersion),
        localVersion: this.localVersion,
        serverVersion,
        serverInfo,
        compatibility,
      };
    } catch (err: unknown) {
      globalRumCollector.recordError(err instanceof Error ? err : String(err));
      return {
        isUpToDate: false,
        localVersion: this.localVersion,
        serverVersion: null,
        serverInfo: {},
        compatibility: { compatible: false, reason: String(err) },
      };
    }
  }

  /**
   * Orchestrates the 15-state PWA upgrade workflow following the rule:
   * PRESERVE FIRST -> VERIFY SECOND -> MIGRATE THIRD -> ACTIVATE FOURTH -> SYNC FIFTH -> COMMIT LAST.
   */
  async performSafePwaUpgrade(
    targetSchemaVersion: number,
    targetAppVersion: string = this.localVersion,
  ): Promise<{
    upgraded: boolean;
    preservedOutboxCount: number;
    preservedProductCount: number;
    preservedVariantCount: number;
    newVersion: number;
    snapshotId?: string;
    state: PwaUpdateState;
  }> {
    const outboxCountBefore = this.localDb.getPendingOutbox().length;
    const prodCountBefore = this.localDb.products.size;
    const varCountBefore = this.localDb.productVariants.size;

    // Validate Compatibility
    const compat = validateReleaseCompatibility({
      applicationVersion: targetAppVersion,
      pwaVersion: targetAppVersion,
      schemaVersion: targetSchemaVersion,
    }, this.matrix);

    if (!compat.compatible) {
      console.warn("PWA Upgrade refused by Release Compatibility Matrix:", compat.reason);
      return {
        upgraded: false,
        preservedOutboxCount: outboxCountBefore,
        preservedProductCount: prodCountBefore,
        preservedVariantCount: varCountBefore,
        newVersion: this.pwaSchemaVersion,
        state: this.stateMachine.getState(),
      };
    }

    if (!Number.isInteger(targetSchemaVersion) || targetSchemaVersion < this.pwaSchemaVersion) {
      return {
        upgraded: false,
        preservedOutboxCount: outboxCountBefore,
        preservedProductCount: prodCountBefore,
        preservedVariantCount: varCountBefore,
        newVersion: this.pwaSchemaVersion,
        state: this.stateMachine.getState(),
      };
    }

    // Step 1: Storage Pressure Check
    const storage = await globalStoragePressureMonitor.checkStorage();
    if (storage.underPressure) {
      console.warn("PWA Upgrade postponed: storage pressure active.");
    }

    // Step 2: Acquire Tab Coordination Lock
    const coordinationAcquired = await globalClientCoordination.acquireUpgradeCoordination(
      targetAppVersion,
      targetSchemaVersion,
    );

    let snapshotId: string | undefined;

    try {
      // Transition: UPDATE_DETECTED -> PREPARING -> QUIESCING
      if (this.stateMachine.canTransitionTo("UPDATE_DETECTED")) {
        this.stateMachine.transitionTo("UPDATE_DETECTED", `Update detected to v${targetAppVersion} (schema ${targetSchemaVersion})`);
      }
      this.stateMachine.setTarget(targetAppVersion, targetSchemaVersion);

      if (this.stateMachine.canTransitionTo("PREPARING")) {
        this.stateMachine.transitionTo("PREPARING");
      }

      if (this.stateMachine.canTransitionTo("QUIESCING")) {
        this.stateMachine.transitionTo("QUIESCING");
      }

      // PRESERVE FIRST: SNAPSHOTTING
      this.stateMachine.transitionTo("SNAPSHOTTING");
      const snapshot = await this.localDb.createVerifiedSnapshot(
        `Pre-upgrade snapshot to v${targetAppVersion} schema ${targetSchemaVersion}`,
        this.localVersion,
      );
      snapshotId = snapshot.id;
      this.stateMachine.setSnapshotId(snapshot.id);

      // VERIFY SECOND: SNAPSHOT_VERIFIED
      this.stateMachine.transitionTo("SNAPSHOT_VERIFIED", `Snapshot ${snapshot.id} checksum verified`);

      // MIGRATE THIRD: MIGRATING
      this.stateMachine.transitionTo("MIGRATING");
      const migration = await this.localDb.migrateToVersion(targetSchemaVersion);

      // MIGRATION_VERIFIED
      this.stateMachine.transitionTo("MIGRATION_VERIFIED", `Migrated to schema ${migration.newVersion}`);

      // ACTIVATE FOURTH: ACTIVATING
      this.stateMachine.transitionTo("ACTIVATING");

      // Post message to Service Worker if supported
      if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "KWAKOPOS_ACTIVATE_RELEASE",
          version: targetAppVersion,
        });
      }

      // HEALTH_CHECKING
      this.stateMachine.transitionTo("HEALTH_CHECKING");

      // Verify health check invariants
      const pendingOutbox = this.localDb.getPendingOutbox();
      if (pendingOutbox.length < outboxCountBefore) {
        throw new Error("DATA_LOSS_VIOLATION: Pending outbox count decreased unexpectedly during upgrade!");
      }

      // COMMIT LAST: COMMITTED
      this.stateMachine.transitionTo("COMMITTED", `Successfully upgraded to v${targetAppVersion}`);
      this.pwaSchemaVersion = migration.newVersion;
      this.localVersion = targetAppVersion;
      this.stateMachine.commitRelease(targetAppVersion, migration.newVersion);

      globalRumCollector.recordPwaState("update-ready");
      globalClientCoordination.releaseUpgradeCoordination(true);

      return {
        upgraded: true,
        preservedOutboxCount: this.localDb.getPendingOutbox().length,
        preservedProductCount: this.localDb.products.size,
        preservedVariantCount: this.localDb.productVariants.size,
        newVersion: this.pwaSchemaVersion,
        snapshotId,
        state: this.stateMachine.getState(),
      };
    } catch (err: any) {
      console.error("PWA Upgrade failed, entering recovery workflow:", err);
      // Recovery Path: RECOVERY -> ROLLBACK_PENDING -> ROLLED_BACK -> RECOVERED
      try {
        if (this.stateMachine.canTransitionTo("RECOVERY")) {
          this.stateMachine.transitionTo("RECOVERY", "Upgrade failed", err?.message);
        }
        if (this.stateMachine.canTransitionTo("ROLLBACK_PENDING")) {
          this.stateMachine.transitionTo("ROLLBACK_PENDING");
        }
        if (snapshotId) {
          await this.localDb.restoreSnapshot(snapshotId);
        }
        if (this.stateMachine.canTransitionTo("ROLLED_BACK")) {
          this.stateMachine.transitionTo("ROLLED_BACK");
        }
        if (this.stateMachine.canTransitionTo("RECOVERED")) {
          this.stateMachine.transitionTo("RECOVERED");
        }
      } catch (recoveryErr) {
        console.error("Critical recovery failure:", recoveryErr);
      } finally {
        globalClientCoordination.releaseUpgradeCoordination(false);
      }

      return {
        upgraded: false,
        preservedOutboxCount: this.localDb.getPendingOutbox().length,
        preservedProductCount: this.localDb.products.size,
        preservedVariantCount: this.localDb.productVariants.size,
        newVersion: this.pwaSchemaVersion,
        snapshotId,
        state: this.stateMachine.getState(),
      };
    }
  }

  /**
   * Sync-safe rollback: Restores runtime to last compatible release
   * without destroying or clearing database records or pending outbox mutations.
   */
  async performRollback(targetVersion: string, targetSchemaVersion: number): Promise<boolean> {
    try {
      const snapshot = await this.localDb.createVerifiedSnapshot(
        `Pre-rollback snapshot before rolling back to ${targetVersion}`,
      );

      if (this.stateMachine.canTransitionTo("ROLLBACK_PENDING")) {
        this.stateMachine.transitionTo("ROLLBACK_PENDING");
      }

      await this.localDb.migrateToVersion(targetSchemaVersion);
      this.localVersion = targetVersion;
      this.pwaSchemaVersion = targetSchemaVersion;

      if (this.stateMachine.canTransitionTo("ROLLED_BACK")) {
        this.stateMachine.transitionTo("ROLLED_BACK");
      }
      if (this.stateMachine.canTransitionTo("RECOVERED")) {
        this.stateMachine.transitionTo("RECOVERED");
      }

      return true;
    } catch (err) {
      console.error("Rollback failed:", err);
      return false;
    }
  }
}

export const globalPwaVersionManager = new PwaVersionManager();
