import { LocalIndexedDbStore } from "./indexedDb";
import { SyncPushRequest, SyncPushResponse, SyncDeltaResponse } from "@kwakopos2/contracts";

export class ClientSyncEngine {
  constructor(
    public deviceId: string,
    public localDb: LocalIndexedDbStore
  ) {}

  /**
   * Pushes all pending outbox operations from local IndexedDB to the Server API,
   * then fetches authoritative delta sync from Server and updates local IndexedDB.
   */
  async syncWithServer(
    pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>
  ): Promise<{ pushed: number; pulled: number }> {
    const pendingOps = this.localDb.getPendingOutbox();
    let pushedCount = 0;

    if (pendingOps.length > 0) {
      const pushPayload: SyncPushRequest = {
        deviceId: this.deviceId,
        operations: pendingOps.map((op) => ({
          operationId: op.id,
          entityType: op.entityType,
          entityId: op.entityId,
          operationType: op.operationType,
          payload: op.payload,
          clientCreatedAt: op.clientCreatedAt,
          idempotencyKey: op.idempotencyKey,
        })),
      };

      const pushRes = await pushApiFn(pushPayload);
      pushedCount = pushRes.processedCount;

      for (const res of pushRes.results) {
        if (res.status === "SUCCESS" || res.status === "ALREADY_PROCESSED") {
          this.localDb.markOutboxSynced(res.operationId);
        }
      }
    }

    // Pull Delta from Server
    const lastSyncTime = this.localDb.syncMetadata.get("lastSyncTime");
    const deltaRes = await deltaApiFn(lastSyncTime);

    // Apply Server Delta to Local IndexedDB
    for (const p of deltaRes.products) {
      this.localDb.saveProductLocal(p);
    }
    for (const v of deltaRes.variants) {
      this.localDb.saveVariantLocal(v);
    }
    for (const l of deltaRes.stockLedger) {
      this.localDb.stockLedger.set(l.id, l);
    }
    for (const a of deltaRes.adjustments) {
      this.localDb.stockAdjustments.set(a.id, a);
    }

    this.localDb.syncMetadata.set("lastSyncTime", deltaRes.serverTimestamp);

    const totalPulled =
      deltaRes.products.length +
      deltaRes.variants.length +
      deltaRes.stockLedger.length +
      deltaRes.adjustments.length;

    return { pushed: pushedCount, pulled: totalPulled };
  }
}
