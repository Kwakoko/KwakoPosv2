import { LocalIndexedDbStore } from "./indexedDb";
import type { SyncPushRequest, SyncPushResponse, SyncDeltaResponse } from "@kwakopos2/contracts";
import { globalRumCollector } from "./rum/rumCollector";

export class ClientSyncEngine {
  public deviceId: string;
  public localDb: LocalIndexedDbStore;

  constructor(deviceId: string, localDb: LocalIndexedDbStore) {
    this.deviceId = deviceId;
    this.localDb = localDb;
  }

  async syncWithServer(
    pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>,
  ): Promise<{ pushed: number; pulled: number }> {
    const startTime = Date.now();
    const pendingOps = this.localDb.getPendingOutbox();
    let pushedCount = 0;

    try {
      if (pendingOps.length > 0) {
        const pushPayload: SyncPushRequest = {
          deviceId: this.deviceId,
          operations: pendingOps.map((op) => ({
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
        pushedCount = pushRes.processedCount;
        for (const res of pushRes.results) {
          if (res.status === "SUCCESS" || res.status === "ALREADY_PROCESSED") this.localDb.markOutboxSynced(res.operationId);
          else if (res.status === "FAILED") this.localDb.markOutboxFailed(res.operationId, res.error || "Server rejected operation");
        }
      }

      const lastSyncTime = this.localDb.syncMetadata.get("lastSyncTime");
      const deltaRes = await deltaApiFn(lastSyncTime);
      for (const product of deltaRes.products) this.localDb.saveProductLocal(product);
      for (const variant of deltaRes.variants) this.localDb.saveVariantLocal(variant);
      for (const ledger of deltaRes.stockLedger) this.localDb.saveStockLedgerLocal(ledger);
      for (const adjustment of deltaRes.adjustments) this.localDb.saveStockAdjustmentLocal(adjustment);
      this.localDb.setSyncMetadata("lastSyncTime", deltaRes.serverTimestamp);

      const totalPulled = deltaRes.products.length + deltaRes.variants.length + deltaRes.stockLedger.length + deltaRes.adjustments.length;
      globalRumCollector.recordSyncMetrics({ durationMs: Date.now() - startTime, pushedCount, deltaCount: totalPulled, success: true, outboxDepth: this.localDb.getPendingOutbox().length });
      return { pushed: pushedCount, pulled: totalPulled };
    } catch (err: unknown) {
      globalRumCollector.recordSyncMetrics({ durationMs: Date.now() - startTime, pushedCount, deltaCount: 0, success: false, outboxDepth: this.localDb.getPendingOutbox().length });
      globalRumCollector.recordError(err instanceof Error ? err : String(err));
      throw err;
    }
  }
}

export * from "./rum/rumCollector";
