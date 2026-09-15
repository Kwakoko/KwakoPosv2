import { LocalIndexedDbStore } from "./indexedDb";
import type { SyncPushRequest, SyncPushResponse, SyncDeltaResponse } from "@kwakopos2/contracts";
import { globalRumCollector } from "./rum/rumCollector";

const MAX_SYNC_BATCH_SIZE = 500;
const DB_NAME = "kwakopos-v2";
const KNOWN_STORES = ["products", "productVariants", "stockLedger", "stockAdjustments", "customers", "suppliers", "syncMetadata", "syncOutbox"] as const;
type KnownStore = typeof KNOWN_STORES[number];

type RevisionedChange = {
  revision: string;
  entityType: string;
  entityId: string;
  operationType: string;
  record: any;
  source?: string;
};

async function applyRevisionedChanges(changes: RevisionedChange[], serverRevision: string, serverTimestamp: string): Promise<number> {
  if (typeof indexedDB === "undefined") throw new Error("SYNC_LOCAL_STORAGE_UNAVAILABLE");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });

  const tx = db.transaction(KNOWN_STORES as unknown as string[], "readwrite");
  const metadata = tx.objectStore("syncMetadata");
  const outbox = tx.objectStore("syncOutbox");
  const pending = (await new Promise<any[]>((resolve, reject) => {
    const request = outbox.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Outbox read failed"));
  })).filter((item) => item?.status === "PENDING");

  let applied = 0;
  let cursor = Number(metadata.get("lastSyncRevision") || 0);
  const sorted = [...changes].sort((a, b) => BigInt(a.revision) < BigInt(b.revision) ? -1 : 1);

  const storeForEntity = (entityType: string): KnownStore | null => {
    switch (entityType) {
      case "Product": return "products";
      case "ProductVariant": return "productVariants";
      case "StockLedger": return "stockLedger";
      case "StockAdjustment": return "stockAdjustments";
      case "Customer": return "customers";
      case "Supplier": return "suppliers";
      default: return null;
    }
  };

  const waitRequest = (request: IDBRequest) => new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("IndexedDB mutation failed"));
  });

  for (const change of sorted) {
    const pendingMutation = pending.find((item) => item.entityType === change.entityType && item.entityId === change.entityId && ["UPDATE", "DELETE"].includes(item.operationType));
    if (pendingMutation) {
      metadata.put(JSON.stringify({
        conflictId: `CONFLICT-${change.entityType}-${change.entityId}-${change.revision}`,
        revision: change.revision,
        entityType: change.entityType,
        entityId: change.entityId,
        operationId: pendingMutation.id,
        localPayload: pendingMutation.payload,
        remoteRecord: change.record,
        detectedAt: new Date().toISOString(),
        status: "OPEN",
      }), `sync_conflict_${change.entityType}_${change.entityId}`);
      break;
    }

    const storeName = storeForEntity(change.entityType);
    const deleted = change.operationType === "DELETE" || Boolean(change.record?._deleted);
    if (deleted) {
      if (storeName) await waitRequest(tx.objectStore(storeName).delete(change.entityId));
      metadata.put(JSON.stringify({ revision: change.revision, entityType: change.entityType, entityId: change.entityId, deletedAt: new Date().toISOString() }), `tombstone:${change.entityType}:${change.entityId}`);
    } else if (storeName) {
      const record = change.record;
      const recoveryPatch = Boolean(record?.__syncRecoveryPatch);
      if (recoveryPatch) {
        const existing = await new Promise<any>((resolve, reject) => {
          const request = tx.objectStore(storeName).get(change.entityId);
          request.onsuccess = () => resolve(request.result || {});
          request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
        });
        const merged = { ...existing, ...record };
        delete merged.__syncRecoveryPatch;
        await waitRequest(tx.objectStore(storeName).put(merged, change.entityId));
      } else {
        await waitRequest(tx.objectStore(storeName).put(record, change.entityId));
      }
    } else {
      metadata.put(JSON.stringify({ revision: change.revision, entityType: change.entityType, entityId: change.entityId, record: change.record }), `shadow:${change.entityType}:${change.entityId}`);
    }

    cursor = Number(change.revision);
    metadata.put(String(change.revision), "lastSyncRevision");
    applied += 1;
  }

  if (changes.length === 0 || applied === changes.length) {
    metadata.put(String(serverRevision), "lastSyncRevision");
    metadata.put(serverTimestamp, "lastSyncTime");
  } else {
    metadata.put(String(cursor), "lastSyncRevision");
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Revisioned sync transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("Revisioned sync transaction aborted"));
  });
  db.close();
  return applied;
}

export class ClientSyncEngine {
  public deviceId: string;
  public localDb: LocalIndexedDbStore;
  private syncInFlight: Promise<{ pushed: number; pulled: number }> | null = null;

  constructor(deviceId: string, localDb: LocalIndexedDbStore) {
    if (!deviceId || deviceId.length > 128) throw new Error("SYNC_CONFIGURATION_INVALID: deviceId is required and must be <= 128 characters");
    this.deviceId = deviceId;
    this.localDb = localDb;
  }

  async syncWithServer(
    pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>,
  ): Promise<{ pushed: number; pulled: number }> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.runSync(pushApiFn, deltaApiFn).finally(() => { this.syncInFlight = null; });
    return this.syncInFlight;
  }

  private async runSync(
    pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>,
  ): Promise<{ pushed: number; pulled: number }> {
    const startTime = Date.now();
    await this.localDb.ready;
    const pendingOps = this.localDb.getPendingOutbox();
    let pushedCount = 0;
    let hadServerRejections = false;

    try {
      for (let offset = 0; offset < pendingOps.length; offset += MAX_SYNC_BATCH_SIZE) {
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
        if (!Array.isArray(pushRes.results) || pushRes.results.length !== batch.length) throw new Error("SYNC_PROTOCOL_VIOLATION: result count mismatch");
        for (const res of pushRes.results) {
          if (!expectedIds.has(res.operationId) || seenIds.has(res.operationId)) throw new Error("SYNC_PROTOCOL_VIOLATION: duplicate or unexpected operation result");
          seenIds.add(res.operationId);
        }
        for (const res of pushRes.results) {
          if (res.status === "SUCCESS" || res.status === "ALREADY_PROCESSED") {
            this.localDb.markOutboxSynced(res.operationId);
            if (res.status === "SUCCESS") pushedCount += 1;
          } else if (res.status === "FAILED") {
            hadServerRejections = true;
            this.localDb.markOutboxFailed(res.operationId, res.error || "Server rejected operation");
          } else throw new Error("SYNC_PROTOCOL_VIOLATION: unknown operation status");
        }
        await this.localDb.flushPersistence();
      }

      const lastRevision = this.localDb.syncMetadata.get("lastSyncRevision") || "0";
      const deltaRes = await deltaApiFn(`rev:${lastRevision}`) as any;
      if (!deltaRes || typeof deltaRes.serverTimestamp !== "string") throw new Error("SYNC_PROTOCOL_VIOLATION: delta response is missing serverTimestamp");

      let totalPulled = 0;
      if (typeof deltaRes.serverRevision === "string" && Array.isArray(deltaRes.changes)) {
        totalPulled = await applyRevisionedChanges(deltaRes.changes as RevisionedChange[], deltaRes.serverRevision, deltaRes.serverTimestamp);
      } else {
        totalPulled = await this.localDb.applyServerDelta(deltaRes);
      }

      globalRumCollector.recordSyncMetrics({
        durationMs: Date.now() - startTime,
        pushedCount,
        deltaCount: totalPulled,
        success: !hadServerRejections,
        outboxDepth: this.localDb.getPendingOutbox().length,
      });
      if (hadServerRejections) globalRumCollector.recordError("SYNC_PARTIAL_REJECTION: failed operations remain queued");
      return { pushed: pushedCount, pulled: totalPulled };
    } catch (err: unknown) {
      globalRumCollector.recordSyncMetrics({ durationMs: Date.now() - startTime, pushedCount, deltaCount: 0, success: false, outboxDepth: this.localDb.getPendingOutbox().length });
      globalRumCollector.recordError(err instanceof Error ? err : String(err));
      throw err;
    }
  }
}

export * from "./rum/rumCollector";
