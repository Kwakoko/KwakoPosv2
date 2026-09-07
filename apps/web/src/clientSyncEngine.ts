import { LocalIndexedDbStore } from "./indexedDb.js";
import type { SyncPushRequest, SyncPushResponse, SyncDeltaResponse } from "@kwakopos2/contracts";
import { globalRumCollector } from "./rum/rumCollector.js";
import { globalClientCoordination } from "./persistence/clientCoordination.js";

const MAX_SYNC_BATCH_SIZE = 500;

export class ClientSyncEngine {
  public deviceId: string;
  public localDb: LocalIndexedDbStore;
  private syncInFlight: Promise<{ pushed: number; pulled: number }> | null = null;

  constructor(deviceId: string, localDb: LocalIndexedDbStore) {
    if (!deviceId || deviceId.length > 128)
      throw new Error("SYNC_CONFIGURATION_INVALID: deviceId is required and must be <= 128 characters");
    this.deviceId = deviceId;
    this.localDb = localDb;
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
