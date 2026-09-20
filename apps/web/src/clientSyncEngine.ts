import { LocalIndexedDbStore, db as defaultDb } from "./indexedDb.js";
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
import { syncDiagnosticService } from "./services/syncDiagnosticService.js";

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

async function defaultPushApi(req: SyncPushRequest): Promise<SyncPushResponse> {
  const token = typeof window !== "undefined" && window.localStorage ? localStorage.getItem("kwakopos_access_token") : null;
  const res = await fetch("/sync/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Sync push failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data || body;
}

async function defaultDeltaApi(since?: string): Promise<SyncDeltaResponse> {
  const token = typeof window !== "undefined" && window.localStorage ? localStorage.getItem("kwakopos_access_token") : null;
  const url = since ? `/sync/delta?since=${encodeURIComponent(since)}` : "/sync/delta";
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Sync delta failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data || body;
}

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
  const initialRevisionRaw = await new Promise<any>((resolve) => {
    const request = metadata.get("lastSyncRevision");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve("0");
  });
  let cursor = BigInt(initialRevisionRaw != null ? String(initialRevisionRaw) : "0");
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

    cursor = BigInt(change.revision);
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
  public pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>;
  public deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>;
  public defaultTenantId?: string;
  private syncInFlight: Promise<{ pushed: number; pulled: number }> | null = null;
  private retryCount = 0;
  private lastReconciliationStatus: "IN_SYNC" | "DIVERGENT" | "UNKNOWN" = "UNKNOWN";

  constructor(
    deviceId: string,
    localDb: LocalIndexedDbStore,
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
    defaultTenantId?: string,
  ) {
    if (!deviceId || deviceId.length > 128)
      throw new Error("SYNC_CONFIGURATION_INVALID: deviceId is required and must be <= 128 characters");
    this.deviceId = deviceId;
    this.localDb = localDb;
    this.pushApiFn = pushApiFn;
    this.deltaApiFn = deltaApiFn;
    this.defaultTenantId = defaultTenantId;
  }

  public init(config: {
    deviceId?: string;
    localDb?: LocalIndexedDbStore;
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>;
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>;
    tenantId?: string;
  }): void {
    if (config.deviceId) this.deviceId = config.deviceId;
    if (config.localDb) this.localDb = config.localDb;
    if (config.pushApiFn) this.pushApiFn = config.pushApiFn;
    if (config.deltaApiFn) this.deltaApiFn = config.deltaApiFn;
    if (config.tenantId) this.defaultTenantId = config.tenantId;
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
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
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

  public async runSync(
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
    tenantId?: string,
  ): Promise<{ pushed: number; pulled: number }> {
    const effectivePush = pushApiFn || this.pushApiFn || defaultPushApi;
    const effectiveDelta = deltaApiFn || this.deltaApiFn || defaultDeltaApi;
    const effectiveTenantId = tenantId || this.defaultTenantId;
    const startTime = Date.now();
    await this.localDb.ready;
    const pendingOps = this.localDb.getPendingOutbox(effectiveTenantId);
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
        const pushRes = await effectivePush(pushPayload);
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
          } else throw new Error("SYNC_PROTOCOL_VIOLATION: unknown operation status");
        }
        await this.localDb.flushPersistence();
      }

      const lastRevision = this.localDb.syncMetadata.get("lastSyncRevision") || "0";
      const deltaRes = (await effectiveDelta(`rev:${lastRevision}`)) as any;
      if (!deltaRes || typeof deltaRes.serverTimestamp !== "string")
        throw new Error("SYNC_PROTOCOL_VIOLATION: delta response is missing serverTimestamp");
      let totalPulled = 0;
      if (typeof deltaRes.serverRevision === "string" && Array.isArray(deltaRes.changes)) {
        totalPulled = await applyRevisionedChanges(
          deltaRes.changes as RevisionedChange[],
          deltaRes.serverRevision,
          deltaRes.serverTimestamp
        );
      } else {
        totalPulled = await this.localDb.applyServerDelta(deltaRes);
      }

      globalRumCollector.recordSyncMetrics({
        durationMs: Date.now() - startTime,
        pushedCount,
        deltaCount: totalPulled,
        success: !hadServerRejections,
        outboxDepth: this.localDb.getPendingOutbox(effectiveTenantId).length,
      });
      if (hadServerRejections) {
        globalRumCollector.recordError(
          "SYNC_PARTIAL_REJECTION: one or more operations remain failed and require reconciliation",
        );
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
      globalRumCollector.recordSyncMetrics({
        durationMs: Date.now() - startTime,
        pushedCount,
        deltaCount: 0,
        success: false,
        outboxDepth: this.localDb.getPendingOutbox(effectiveTenantId).length,
      });
      globalRumCollector.recordError(err instanceof Error ? err : String(err));
      syncDiagnosticService.logFailure(err, {
        endpoint: "/sync/push",
        outboxPendingCount: pendingOps.length,
        tenantId: effectiveTenantId,
      });
      throw err;
    }
  }
}

export const clientSyncEngine = new ClientSyncEngine(
  typeof crypto !== "undefined" && crypto.randomUUID ? `web-${crypto.randomUUID()}` : `web-client-default`,
  new LocalIndexedDbStore(4),
);

export async function reconcileInventory(
  serverSnapshot: any,
  customDb?: LocalIndexedDbStore
): Promise<number> {
  const db = customDb || clientSyncEngine.localDb || defaultDb;
  const localDeltas = await db.stockAdjustments
    .where("variantId")
    .equals(serverSnapshot.id)
    .and((adj: any) => adj.status === "PENDING")
    .toArray();

  let reconciledQty = Number(serverSnapshot.inventoryQuantity ?? (serverSnapshot as any).stock ?? 0);

  for (const delta of localDeltas) {
    const change = Number((delta as any).change ?? (delta as any).quantityChange ?? (delta as any).quantity ?? 0);
    reconciledQty += change; // apply relative mutation
  }

  await db.productVariants.update(serverSnapshot.id, {
    ...serverSnapshot,
    inventoryQuantity: reconciledQty,
    stock: reconciledQty,
    lastSyncedAt: Date.now(),
  } as any);

  // mark deltas as reconciled
  for (const delta of localDeltas) {
    await db.stockAdjustments.update(delta.id, { status: "RECONCILED" } as any);
  }

  if (serverSnapshot.productId && typeof (db as any).recalculateProductStockLocal === "function") {
    (db as any).recalculateProductStockLocal(serverSnapshot.productId);
  }

  return reconciledQty;
}

export * from "./rum/rumCollector.js";

