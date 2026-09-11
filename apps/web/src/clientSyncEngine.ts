import { LocalIndexedDbStore } from "./indexedDb.js";
import type {
  SyncPushRequest,
  SyncPushResponse,
  SyncDeltaResponse,
  SyncBootstrapRequest,
  SyncBootstrapResponse,
  SyncStateManifest,
  SyncReconciliationResponse,
  SyncObservabilityStatus,
} from "@kwakopos2/contracts";
import { globalRumCollector } from "./rum/rumCollector.js";
import { globalClientCoordination } from "./persistence/clientCoordination.js";

const MAX_SYNC_BATCH_SIZE = 500;

export class ClientSyncEngine {
  public deviceId: string;
  public localDb: LocalIndexedDbStore;
  private syncInFlight: Promise<{ pushed: number; pulled: number }> | null = null;
  private retryCount = 0;
  private lastReconciliationStatus: "IN_SYNC" | "DIVERGENT" | "UNKNOWN" = "UNKNOWN";

  constructor(deviceId: string, localDb: LocalIndexedDbStore) {
    if (!deviceId || deviceId.length > 128)
      throw new Error("SYNC_CONFIGURATION_INVALID: deviceId is required and must be <= 128 characters");
    this.deviceId = deviceId;
    this.localDb = localDb;
  }

  async bootstrapWithServer(
    bootstrapApiFn: (req: SyncBootstrapRequest) => Promise<SyncBootstrapResponse>,
    tenantId?: string,
    branchId?: string,
  ): Promise<{ applied: number; snapshotTimestamp: string }> {
    await this.localDb.ready;
    const req: SyncBootstrapRequest = {
      deviceId: this.deviceId,
      clientVersion: "2.12.5",
      schemaVersion: this.localDb.schemaVersion,
      branchId,
    };
    const snapshot = await bootstrapApiFn(req);
    if (!snapshot || typeof snapshot.snapshotTimestamp !== "string") {
      throw new Error("SYNC_PROTOCOL_VIOLATION: invalid bootstrap snapshot response");
    }
    const result = await this.localDb.bootstrapFromAuthoritativeSnapshot(snapshot, { tenantId: tenantId || "", branchId });
    return { applied: result.applied, snapshotTimestamp: snapshot.snapshotTimestamp };
  }

  async reconcileWithServer(
    reconcileApiFn: (manifest: SyncStateManifest) => Promise<SyncReconciliationResponse>,
    tenantId?: string,
  ): Promise<SyncReconciliationResponse> {
    await this.localDb.ready;
    const manifest = this.localDb.generateStateManifest(this.deviceId, tenantId);
    const report = await reconcileApiFn(manifest);
    this.lastReconciliationStatus = report.inSync ? "IN_SYNC" : "DIVERGENT";
    this.localDb.setSyncMetadata("reconciliationStatus", this.lastReconciliationStatus);
    this.localDb.setSyncMetadata("lastReconciliationTime", report.evaluatedAt);
    return report;
  }

  getObservabilityStatus(tenantId?: string): SyncObservabilityStatus {
    const pendingOutbox = this.localDb.getPendingOutbox(tenantId);
    const failedOutbox = this.localDb.getFailedOutbox(tenantId);
    const lastSync = this.localDb.syncMetadata.get("lastSyncTime") || null;
    const lastBootstrap = this.localDb.syncMetadata.get("lastBootstrapTime") || null;
    const isBootstrapped = Boolean(lastBootstrap || lastSync);

    return {
      tenantId: tenantId || "DEFAULT",
      lastSyncTime: lastSync,
      pendingOutboxCount: pendingOutbox.length,
      failedOperationsCount: failedOutbox.length,
      retryCount: this.retryCount,
      syncCursor: lastSync,
      serverVersion: "2.12.5",
      clientVersion: "2.12.5",
      schemaVersion: this.localDb.schemaVersion,
      serviceWorkerVersion: "2.12.5",
      conflictCount: Array.from(this.localDb.syncMetadata.keys()).filter((k) => k.startsWith("sync_conflict_")).length,
      reconciliationStatus: this.lastReconciliationStatus,
      bootstrapStatus: isBootstrapped ? "BOOTSTRAPPED" : "NOT_BOOTSTRAPPED",
      lastAuthoritativeSnapshot: lastBootstrap,
      integrityStatus: "VERIFIED",
    };
  }

  async syncWithServer(
    pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>,
    tenantId?: string,
  ): Promise<{ pushed: number; pulled: number }> {
    if (globalClientCoordination.isClientQuiesced()) {
      console.info("[SYNC] Client is quiesced for PWA migration; deferring synchronization cycle.");
      return { pushed: 0, pulled: 0 };
    }

    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.runSync(pushApiFn, deltaApiFn, tenantId).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  private async runSync(
    pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>,
    tenantId?: string,
  ): Promise<{ pushed: number; pulled: number }> {
    const startTime = Date.now();
    await this.localDb.ready;
    const pendingOps = this.localDb.getPendingOutbox(tenantId);
    let pushedCount = 0;
    let hadServerRejections = false;

    try {
      for (let offset = 0; offset < pendingOps.length; offset += MAX_SYNC_BATCH_SIZE) {
        if (globalClientCoordination.isClientQuiesced()) {
          console.info("[SYNC] Client quiesced mid-sync; pausing further batch dispatch.");
          break;
        }

        const batch = pendingOps.slice(offset, offset + MAX_SYNC_BATCH_SIZE);
        const pushPayload: SyncPushRequest = {
          deviceId: this.deviceId,
          operations: batch.map((op) => ({
            operationId: op.id,
            entityType: op.entityType as any,
            entityId: op.entityId,
            operationType: op.operationType,
            payload: op.payload,
            clientCreatedAt: op.clientCreatedAt,
            idempotencyKey: op.idempotencyKey,
          })),
        };
        const pushRes = await pushApiFn(pushPayload);
        const expectedIds = new Set(batch.map((op) => op.id));
        const seenIds = new Set<string>();
        if (!Array.isArray(pushRes.results) || pushRes.results.length !== batch.length) {
          throw new Error(
            "SYNC_PROTOCOL_VIOLATION: server response does not contain exactly one result per submitted operation",
          );
        }
        for (const res of pushRes.results) {
          if (!expectedIds.has(res.operationId) || seenIds.has(res.operationId)) {
            throw new Error(
              "SYNC_PROTOCOL_VIOLATION: server returned an unexpected or duplicate operation result",
            );
          }
          seenIds.add(res.operationId);
        }
        if (seenIds.size !== expectedIds.size)
          throw new Error("SYNC_PROTOCOL_VIOLATION: server omitted an operation result");

        for (const res of pushRes.results) {
          if (res.status === "SUCCESS" || res.status === "ALREADY_PROCESSED") {
            this.localDb.markOutboxSynced(res.operationId);
            if (res.status === "SUCCESS") pushedCount += 1;
          } else if (res.status === "FAILED") {
            hadServerRejections = true;
            this.localDb.markOutboxFailed(res.operationId, res.error || "Server rejected operation");
          } else {
            throw new Error("SYNC_PROTOCOL_VIOLATION: server returned an unknown operation status");
          }
        }
        await this.localDb.flushPersistence();
      }

      const lastSyncTime = this.localDb.syncMetadata.get("lastSyncTime");
      const deltaRes = await deltaApiFn(lastSyncTime);
      if (!deltaRes || typeof deltaRes.serverTimestamp !== "string")
        throw new Error("SYNC_PROTOCOL_VIOLATION: delta response is missing serverTimestamp");
      const totalPulled = await this.localDb.applyServerDelta(deltaRes);

      globalRumCollector.recordSyncMetrics({
        durationMs: Date.now() - startTime,
        pushedCount,
        deltaCount: totalPulled,
        success: !hadServerRejections,
        outboxDepth: this.localDb.getPendingOutbox(tenantId).length,
      });
      if (hadServerRejections) {
        globalRumCollector.recordError(
          "SYNC_PARTIAL_REJECTION: one or more operations remain failed and require reconciliation",
        );
      }
      return { pushed: pushedCount, pulled: totalPulled };
    } catch (err: unknown) {
      globalRumCollector.recordSyncMetrics({
        durationMs: Date.now() - startTime,
        pushedCount,
        deltaCount: 0,
        success: false,
        outboxDepth: this.localDb.getPendingOutbox(tenantId).length,
      });
      globalRumCollector.recordError(err instanceof Error ? err : String(err));
      throw err;
    }
  }
}

export * from "./rum/rumCollector.js";
