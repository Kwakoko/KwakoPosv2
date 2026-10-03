import { LocalIndexedDbStore, db as defaultDb, outboxMatchesScope } from "./indexedDb.js";
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
import { getEffectiveStock } from "./services/inventoryStockService.js";
import { apiFetch } from "./services/apiClient.js";
import { AUTHORITATIVE_COMPATIBILITY_MATRIX } from "./persistence/releaseCompatibility.js";
import {
  type PersistenceStatusRecord,
  createPersistenceStatus,
  emitPersistenceStatusChanged,
  persistenceStatusKey,
} from "./persistence/persistenceStatus.js";
import { normalizeSyncPayload } from "./services/payloadValidationService.js";

const MAX_SYNC_BATCH_SIZE = 500;
const DB_NAME = "kwakopos-v2";
const KNOWN_STORES = ["products", "productVariants", "stockLedger", "stockAdjustments", "customers", "suppliers", "productPriceHistory", "sales", "payments", "receipts", "configuration", "syncMetadata", "syncOutbox"] as const;
type KnownStore = typeof KNOWN_STORES[number];

function scopedSyncKey(tenantId: string, branchId: string, key: string): string {
  if (!tenantId || !branchId) throw new Error("SYNC_CONTEXT_REQUIRED: tenantId and branchId are required");
  return "syncScope:" + tenantId + ":" + branchId + ":" + key;
}

type RevisionedChange = {
  revision: string;
  entityType: string;
  entityId: string;
  operationType: string;
  record: any;
  source?: string;
};

async function defaultPushApi(req: SyncPushRequest): Promise<SyncPushResponse> {
  const body = await apiFetch<any>("/sync/push", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return body.data || body;
}

async function defaultDeltaApi(since?: string): Promise<SyncDeltaResponse> {
  const url = since ? `/sync/delta?since=${encodeURIComponent(since)}` : "/sync/delta";
  const body = await apiFetch<any>(url);
  return body.data || body;
}

async function defaultBootstrapApi(req: SyncBootstrapRequest): Promise<SyncBootstrapResponse> {
  const body = await apiFetch<any>("/sync/bootstrap", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return body.data || body;
}

async function defaultReconcileApi(manifest: SyncStateManifest): Promise<SyncReconciliationResponse> {
  const body = await apiFetch<any>("/sync/reconcile", {
    method: "POST",
    body: JSON.stringify(manifest),
  });
  return body.data || body;
}

export async function applyRevisionedChanges(
  changes: RevisionedChange[],
  serverRevision: string,
  serverTimestamp: string,
  tenantId: string,
  branchId: string,
  syncEpoch?: string,
  dbName = DB_NAME,
): Promise<number> {
  if (typeof indexedDB === "undefined") throw new Error("SYNC_LOCAL_STORAGE_UNAVAILABLE");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });

  const tx = db.transaction(KNOWN_STORES as unknown as string[], "readwrite");
  const revisionKey = scopedSyncKey(tenantId, branchId, "lastSyncRevision");
  const syncTimeKey = scopedSyncKey(tenantId, branchId, "lastSyncTime");
  const syncEpochKey = scopedSyncKey(tenantId, branchId, "syncEpoch");
  const categoryKey = tenantId + ":" + branchId + ":inventory_categories_meta";
  const brandKey = tenantId + ":" + branchId + ":inventory_brands_meta";
  const metadata = tx.objectStore("syncMetadata");
  const configuration = tx.objectStore("configuration");
  const outbox = tx.objectStore("syncOutbox");
  const pending = (await new Promise<any[]>((resolve, reject) => {
    const request = outbox.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Outbox read failed"));
  })).filter((item) => outboxMatchesScope(item, tenantId, branchId) && (item?.status === "PENDING" || (item?.status === "FAILED" && String(item?.error || "").startsWith("SYNC_CONFLICT:"))));

  let applied = 0;
  const persistenceStatusEvents: PersistenceStatusRecord[] = [];
  const detectedConflicts: any[] = [];
  const initialRevisionRaw = await new Promise<any>((resolve) => {
    const request = metadata.get(revisionKey);
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
      case "ProductPriceHistory": return "productPriceHistory";
      case "Sale": return "sales";
      case "Payment": return "payments";
      case "PurchaseReceipt": return "receipts";
      case "Category": return "configuration";
      case "Brand": return "configuration";
      default: return null;
    }
  };

  const waitRequest = (request: IDBRequest) => new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("IndexedDB mutation failed"));
  });

  const upsertCatalogConfig = async (entityType: "Category" | "Brand", change: RevisionedChange, deleted: boolean) => {
    const key = entityType === "Category" ? categoryKey : brandKey;
    const currentRecord = await new Promise<any>((resolve, reject) => {
      const request = configuration.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Catalog configuration read failed"));
    });
    const existing = Array.isArray(currentRecord?.value) ? currentRecord.value : [];
    const map = new Map(existing.map((item: any) => [String(item.id), item]));
    if (deleted) map.delete(change.entityId);
    else {
      const record = change.record || {};
      map.set(change.entityId, { id: change.entityId, name: record.name ?? "", isDefault: false, isActive: record.isActive !== false, updatedAt: record.updatedAt ?? serverTimestamp, ...(entityType === "Category" ? { description: record.description ?? undefined, color: record.color || "#10b981", parentId: record.parentId ?? null } : { origin: record.origin ?? undefined, notes: record.notes ?? undefined }) });
    }
    configuration.put({ key: entityType === "Category" ? "inventory_categories_meta" : "inventory_brands_meta", value: Array.from(map.values()).filter((item: any) => item.isActive !== false), tenantId, updatedAt: serverTimestamp }, key);
  };

  for (const change of sorted) {
    const pendingMutation = pending.find((item) => item.tenantId === tenantId && (!item.branchId || item.branchId === branchId) && item.entityType === change.entityType && item.entityId === change.entityId && ["UPDATE", "DELETE"].includes(item.operationType));
    if (pendingMutation) {
      const conflictId = "conflict:" + pendingMutation.id;
      const conflictRecord = { conflictId, revision: change.revision, entityType: change.entityType, entityId: change.entityId, operationId: pendingMutation.id, operationType: pendingMutation.operationType, localPayload: pendingMutation.payload, remoteRecord: change.record, detectedAt: new Date().toISOString(), status: "OPEN" };
      metadata.put(JSON.stringify(conflictRecord), "sync_conflict_" + conflictId);
      metadata.put(JSON.stringify(conflictRecord), "sync_conflict_" + change.entityType + "_" + change.entityId);
      detectedConflicts.push(conflictRecord);
      const rawStatus = await new Promise<any>((resolve) => {
        const request = metadata.get(persistenceStatusKey(tenantId, branchId, change.entityType, change.entityId));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      let previous: any;
      try {
        previous = rawStatus ? JSON.parse(rawStatus) : undefined;
      } catch {
        previous = undefined;
      }
      const conflictStatus = createPersistenceStatus(
        {
          tenantId,
          branchId,
          entityType: change.entityType,
          entityId: change.entityId,
          operationId: pendingMutation.id,
          operationType: pendingMutation.operationType,
        },
        "CONFLICT",
        previous,
        { conflictId, serverRevision: change.revision },
      );
      metadata.put(JSON.stringify(conflictStatus), persistenceStatusKey(tenantId, branchId, change.entityType, change.entityId));
      persistenceStatusEvents.push(conflictStatus);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("kwakopos:sync-conflict-detected", {
            detail: {
              conflictId,
              entityType: change.entityType,
              entityId: change.entityId,
              revision: change.revision,
              operationId: pendingMutation.id,
            },
          }),
        );
      }
      break;
    }

    const storeName = storeForEntity(change.entityType);
    const deleted = change.operationType === "DELETE" || Boolean(change.record?._deleted);
    if (change.entityType === "Category" || change.entityType === "Brand") {
      await upsertCatalogConfig(change.entityType, change, deleted);
    } else if (deleted) {
      if (storeName) await waitRequest(tx.objectStore(storeName).delete(change.entityId));
      const tombstonedAt = new Date().toISOString();
      metadata.put(JSON.stringify({ revision: change.revision, entityType: change.entityType, entityId: change.entityId, deletedAt: tombstonedAt }), "tombstone:" + change.entityType + ":" + change.entityId);
      const rawStatus = await new Promise<any>((resolve) => {
        const request = metadata.get(persistenceStatusKey(tenantId, branchId, change.entityType, change.entityId));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      let previous: any;
      try {
        previous = rawStatus ? JSON.parse(rawStatus) : undefined;
      } catch {
        previous = undefined;
      }
      const tombstoneStatus = createPersistenceStatus(
        {
          tenantId,
          branchId,
          entityType: change.entityType,
          entityId: change.entityId,
          operationId: "server:" + change.revision,
          operationType: "DELETE",
        },
        "TOMBSTONED",
        previous,
        { serverRevision: change.revision },
      );
      metadata.put(JSON.stringify(tombstoneStatus), persistenceStatusKey(tenantId, branchId, change.entityType, change.entityId));
      persistenceStatusEvents.push(tombstoneStatus);
    } else if (storeName) {
      const record = change.record;
      const recoveryPatch = Boolean(record?.__syncRecoveryPatch);
      const targetStore = tx.objectStore(storeName);

      // A locally committed StockLedger row can be echoed back by the server's
      // canonical journal event. Reconcile by durable idempotency key so the
      // replica replaces the local row instead of double-counting inventory.
      if (change.entityType === "StockLedger" && record?.idempotencyKey) {
        const existingRows = await new Promise<any[]>((resolve, reject) => {
          const request = targetStore.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error || new Error("IndexedDB ledger read failed"));
        });
        for (const existingRow of existingRows) {
          if (existingRow?.idempotencyKey === record.idempotencyKey && String(existingRow.id) !== String(change.entityId)) {
            await waitRequest(targetStore.delete(existingRow.id));
          }
        }
      }

      if (recoveryPatch) {
        const existing = await new Promise<any>((resolve, reject) => {
          const request = targetStore.get(change.entityId);
          request.onsuccess = () => resolve(request.result || {});
          request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
        });
        const merged = { ...existing, ...record };
        delete merged.__syncRecoveryPatch;
        await waitRequest(targetStore.put(merged, change.entityId));
      } else {
        await waitRequest(targetStore.put(record, change.entityId));
      }
    }

    cursor = BigInt(change.revision);
    metadata.put(String(change.revision), revisionKey);
    applied += 1;
  }

  if (changes.length === 0 || applied === changes.length) {
    metadata.put(String(serverRevision), revisionKey);
    metadata.put(serverTimestamp, syncTimeKey);
  } else {
    metadata.put(String(cursor), revisionKey);
  }
  if (syncEpoch) {
    metadata.put(String(syncEpoch), syncEpochKey);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Revisioned sync transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("Revisioned sync transaction aborted"));
  });
  db.close();
  for (const status of persistenceStatusEvents) emitPersistenceStatusChanged(status);
  for (const conflict of detectedConflicts) {
    try {
      await apiFetch("/sync/conflicts/register", { method: "POST", body: JSON.stringify({ ...conflict, deviceId: "web-client" }) });
    } catch {
      console.warn("[SYNC] Conflict detected locally; authoritative registration will retry.");
    }
  }
  return applied;
}

export class ClientSyncEngine {
  public deviceId: string;
  public localDb: LocalIndexedDbStore;
  public pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>;
  public deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>;
  public defaultTenantId?: string;
  public defaultBranchId?: string;
  private syncInFlight: Promise<{ pushed: number; pulled: number }> | null = null;
  private retryCount = 0;
  private lastReconciliationStatus: "IN_SYNC" | "DIVERGENT" | "UNKNOWN" = "UNKNOWN";

  constructor(
    deviceId: string,
    localDb: LocalIndexedDbStore,
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
    defaultTenantId?: string,
    defaultBranchId?: string,
  ) {
    if (!deviceId || deviceId.length > 128)
      throw new Error("SYNC_CONFIGURATION_INVALID: deviceId is required and must be <= 128 characters");
    this.deviceId = deviceId;
    this.localDb = localDb;
    this.pushApiFn = pushApiFn;
    this.deltaApiFn = deltaApiFn;
    this.defaultTenantId = defaultTenantId;
    this.defaultBranchId = defaultBranchId;
  }

  public init(config: {
    deviceId?: string;
    localDb?: LocalIndexedDbStore;
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>;
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>;
    tenantId?: string;
    branchId?: string;
  }): void {
    if (config.deviceId) this.deviceId = config.deviceId;
    if (config.localDb) this.localDb = config.localDb;
    if (config.pushApiFn) this.pushApiFn = config.pushApiFn;
    if (config.deltaApiFn) this.deltaApiFn = config.deltaApiFn;
    if (config.tenantId) this.defaultTenantId = config.tenantId;
    if (config.branchId) this.defaultBranchId = config.branchId;
  }

  async bootstrapWithServer(
    bootstrapApiFn: (req: SyncBootstrapRequest) => Promise<SyncBootstrapResponse>,
    tenantId?: string,
    branchId?: string,
  ): Promise<{ applied: number; snapshotTimestamp: string }> {
    await this.localDb.ready;
    const req: SyncBootstrapRequest = {
      deviceId: this.deviceId,
      clientVersion: AUTHORITATIVE_COMPATIBILITY_MATRIX.applicationVersion,
      schemaVersion: this.localDb.schemaVersion,
      branchId,
    };
    const snapshot = await bootstrapApiFn(req);
    if (!snapshot || typeof snapshot.snapshotTimestamp !== "string") {
      throw new Error("SYNC_PROTOCOL_VIOLATION: invalid bootstrap snapshot response");
    }
    const effectiveTenantId = tenantId || (snapshot as any).tenantId || "";
    const effectiveBranchId = branchId || (snapshot as any).branchId || (Array.isArray((snapshot as any).products) ? (snapshot as any).products[0]?.branchId : undefined) || "branch-default";
    if (!effectiveTenantId) throw new Error("SYNC_CONTEXT_REQUIRED: tenantId is required for bootstrap");
    this.defaultTenantId = effectiveTenantId;
    this.defaultBranchId = effectiveBranchId;
    const result = await this.localDb.bootstrapFromAuthoritativeSnapshot(snapshot, { tenantId: effectiveTenantId, branchId: effectiveBranchId });
    return { applied: result.applied, snapshotTimestamp: snapshot.snapshotTimestamp };
  }

  async reconcileWithServer(
    reconcileApiFn: (manifest: SyncStateManifest) => Promise<SyncReconciliationResponse>,
    tenantId?: string,
    branchId?: string,
  ): Promise<SyncReconciliationResponse> {
    await this.localDb.ready;
    const effectiveTenantId = tenantId || this.defaultTenantId || "";
    const effectiveBranchId = branchId || this.defaultBranchId || "branch-default";
    if (!effectiveTenantId) throw new Error("SYNC_CONTEXT_REQUIRED: tenantId is required for replica reconciliation");
    const manifest = this.localDb.generateStateManifest(this.deviceId, effectiveTenantId, effectiveBranchId);
    const report = await reconcileApiFn(manifest);
    this.lastReconciliationStatus = report.inSync ? "IN_SYNC" : "DIVERGENT";
    const prefix = scopedSyncKey(effectiveTenantId, effectiveBranchId, "");
    this.localDb.setSyncMetadata(prefix + "reconciliationStatus", this.lastReconciliationStatus);
    this.localDb.setSyncMetadata(prefix + "lastReconciliationTime", report.evaluatedAt);
    this.localDb.setSyncMetadata(prefix + "lastReconciliationChecksum", report.integrityChecksum);
    if (report.serverRevision) this.localDb.setSyncMetadata(prefix + "lastServerRevision", report.serverRevision);
    return report;
  }

  getObservabilityStatus(tenantId?: string): SyncObservabilityStatus {
    const branch = this.defaultBranchId || "branch-default";
    const pendingOutbox = this.localDb.getPendingOutbox(tenantId, branch);
    const failedOutbox = this.localDb.getFailedOutbox(tenantId, branch);
    const scopedTenant = tenantId || this.defaultTenantId || "tenant-default";
    const lastSync = this.localDb.syncMetadata.get(scopedSyncKey(scopedTenant, branch, "lastSyncTime")) || null;
    const syncCursor = String(this.localDb.syncMetadata.get(scopedSyncKey(scopedTenant, branch, "lastSyncRevision")) || "0");
    const lastBootstrap = this.localDb.syncMetadata.get(scopedSyncKey(scopedTenant, branch, "lastBootstrapTime")) || null;
    const reconciliationStatus = this.localDb.syncMetadata.get(scopedSyncKey(scopedTenant, branch, "reconciliationStatus")) || this.lastReconciliationStatus;
    const isBootstrapped = Boolean(lastBootstrap || lastSync);

    return {
      tenantId: tenantId || "DEFAULT",
      lastSyncTime: lastSync,
      pendingOutboxCount: pendingOutbox.length,
      failedOperationsCount: failedOutbox.length,
      retryCount: this.retryCount,
      syncCursor,
      serverVersion: AUTHORITATIVE_COMPATIBILITY_MATRIX.applicationVersion,
      clientVersion: AUTHORITATIVE_COMPATIBILITY_MATRIX.applicationVersion,
      schemaVersion: this.localDb.schemaVersion,
      serviceWorkerVersion: AUTHORITATIVE_COMPATIBILITY_MATRIX.pwaVersion,
      conflictCount: Array.from(this.localDb.syncMetadata.keys()).filter((k) => k.startsWith("sync_conflict_")).length,
      reconciliationStatus: reconciliationStatus === "IN_SYNC" ? "IN_SYNC" : reconciliationStatus === "DIVERGENT" ? "DIVERGENT" : "UNKNOWN",
      bootstrapStatus: isBootstrapped ? "BOOTSTRAPPED" : "NOT_BOOTSTRAPPED",
      lastAuthoritativeSnapshot: lastBootstrap,
      integrityStatus: reconciliationStatus === "IN_SYNC" ? "VERIFIED" : reconciliationStatus === "DIVERGENT" ? "FAILED" : "PENDING",
    };
  }

  async syncWithServer(
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
    tenantId?: string,
    branchId?: string,
    reconcileApiFn?: (manifest: SyncStateManifest) => Promise<SyncReconciliationResponse>,
  ): Promise<{ pushed: number; pulled: number }> {
    if (globalClientCoordination.isClientQuiesced()) {
      console.info("[SYNC] Client is quiesced for PWA migration; deferring synchronization cycle.");
      return { pushed: 0, pulled: 0 };
    }

    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.runSync(pushApiFn, deltaApiFn, tenantId, branchId, reconcileApiFn).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  public async runSync(
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
    tenantId?: string,
    branchId?: string,
    reconcileApiFn?: (manifest: SyncStateManifest) => Promise<SyncReconciliationResponse>,
  ): Promise<{ pushed: number; pulled: number }> {
    const effectivePush = pushApiFn || this.pushApiFn || defaultPushApi;
    const effectiveDelta = deltaApiFn || this.deltaApiFn || defaultDeltaApi;
    const startTime = Date.now();
    await this.localDb.ready;
    const allPending = this.localDb.getPendingOutbox();
    const pendingTenants = [...new Set(allPending.map((item) => item.tenantId).filter((value): value is string => Boolean(value)))];
    const effectiveTenantId = tenantId || this.defaultTenantId || (pendingTenants.length === 1 ? pendingTenants[0] : "tenant-default");
    if (!tenantId && !this.defaultTenantId && pendingTenants.length > 1) throw new Error("SYNC_CONTEXT_REQUIRED: tenantId is required when multiple tenant mutations are pending");
    const tenantPending = this.localDb.getPendingOutbox(effectiveTenantId);
    const pendingBranches = [...new Set(tenantPending.map((item) => item.branchId).filter((value): value is string => Boolean(value)))];
    const effectiveBranchId = branchId || this.defaultBranchId || (pendingBranches.length === 1 ? pendingBranches[0] : "branch-default");
    if (!branchId && !this.defaultBranchId && pendingBranches.length > 1) throw new Error("SYNC_CONTEXT_REQUIRED: branchId is required when multiple branch mutations are pending");
    const pendingOps = this.localDb.getPendingOutbox(effectiveTenantId, effectiveBranchId);
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
          operations: batch.map((op) => {
            const normalizedPayload = normalizeSyncPayload(
              op.entityType,
              op.operationType,
              op.payload,
              {
                deviceId: this.deviceId,
                operationId: op.id,
                idempotencyKey: op.idempotencyKey,
                entityId: op.entityId,
              }
            );
            return {
              operationId: op.id,
              entityType: op.entityType as any,
              entityId: op.entityId,
              operationType: op.operationType,
              payload: normalizedPayload,
              clientCreatedAt: op.clientCreatedAt,
              idempotencyKey: op.idempotencyKey,
            };
          }),
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
            const serverError = res.error || "Server rejected operation";
            if (serverError.startsWith("SYNC_CONFLICT:")) {
              const conflictId = serverError.slice("SYNC_CONFLICT:".length);
              const item = batch.find((candidate) => candidate.id === res.operationId);
              if (item) {
                const conflict = { conflictId, operationId: item.id, entityType: item.entityType, entityId: item.entityId, localPayload: item.payload, detectedAt: new Date().toISOString(), status: "OPEN" };
                this.localDb.setSyncMetadata("sync_conflict_" + conflictId, JSON.stringify(conflict));
                this.localDb.setSyncMetadata("sync_conflict_" + item.entityType + "_" + item.entityId, JSON.stringify(conflict));
              }
            }
            this.localDb.markOutboxFailed(res.operationId, serverError);
          } else throw new Error("SYNC_PROTOCOL_VIOLATION: unknown operation status");
        }
        await this.localDb.flushPersistence();
      }

      const lastRevision = this.localDb.syncMetadata.get(scopedSyncKey(effectiveTenantId, effectiveBranchId, "lastSyncRevision")) || "0";
      const deltaRes = (await effectiveDelta(`rev:${lastRevision}`)) as any;
      if (!deltaRes || typeof deltaRes.serverTimestamp !== "string")
        throw new Error("SYNC_PROTOCOL_VIOLATION: delta response is missing serverTimestamp");

      let totalPulled = 0;
      if (deltaRes.requiresBootstrap) {
        console.info(
          `[SYNC] Journal compaction gap detected (client cursor rev:${lastRevision} was pruned; journal min is rev:${deltaRes.compactionMinRevision}). Initiating authoritative snapshot bootstrap.`
        );
        const bootstrapRes = await this.bootstrapWithServer(defaultBootstrapApi, effectiveTenantId, effectiveBranchId);
        totalPulled = bootstrapRes.applied;
        await this.localDb.refreshStoresFromNative([
          "products", "productVariants", "stockLedger", "stockAdjustments", "productPriceHistory",
          "sales", "payments", "receipts", "customers", "suppliers", "configuration", "syncOutbox", "syncMetadata",
        ]);
      } else if (typeof deltaRes.serverRevision === "string" && Array.isArray(deltaRes.changes)) {
        totalPulled = await applyRevisionedChanges(
          deltaRes.changes as RevisionedChange[],
          deltaRes.serverRevision,
          deltaRes.serverTimestamp,
          effectiveTenantId || "tenant-default",
          effectiveBranchId,
          typeof deltaRes.syncEpoch === "string" ? deltaRes.syncEpoch : undefined,
        );
        await this.localDb.refreshStoresFromNative([
          "products", "productVariants", "stockLedger", "stockAdjustments", "productPriceHistory",
          "sales", "payments", "receipts", "customers", "suppliers", "configuration", "syncOutbox", "syncMetadata",
        ]);

        // Stock Ledger is authoritative. Rebuild the derived variant/product stock
        // projections after a server delta so every browser reports the same balance.
        const affectedVariantIds = new Set<string>();
        for (const change of deltaRes.changes as RevisionedChange[]) {
          const variantId = String(
            change.entityType === "ProductVariant"
              ? change.entityId
              : (change.record?.variantId || ""),
          ).trim();
          if (variantId) affectedVariantIds.add(variantId);
        }
        const affectedProductIds = new Set<string>();
        for (const variantId of affectedVariantIds) {
          const variant = this.localDb.productVariants.get(variantId) as any;
          if (!variant || variant.tenantId !== effectiveTenantId || variant.branchId !== effectiveBranchId) continue;
          const effectiveStock = getEffectiveStock(
            this.localDb,
            variantId,
            variant.productId,
            effectiveTenantId,
            effectiveBranchId,
          );
          const updatedVariant = {
            ...variant,
            inventoryQuantity: effectiveStock.stock,
            stock: effectiveStock.stock,
          };
          this.localDb.productVariants.set(variantId, updatedVariant);
          this.localDb.persist("productVariants", variantId, updatedVariant);
          if (variant.productId) affectedProductIds.add(String(variant.productId));
        }
        for (const productId of affectedProductIds) {
          this.localDb.recalculateProductStockLocal(productId);
        }
        if (affectedVariantIds.size > 0) {
          await this.localDb.flushPersistence();
        }
      } else {
        totalPulled = await this.localDb.applyServerDelta(deltaRes);
      }

      // HTTP success does not prove replica convergence. Verify the complete
      // tenant/branch inventory replica and bootstrap once when it diverges.
      const reconcile = reconcileApiFn || defaultReconcileApi;
      let reconciliation = await this.reconcileWithServer(
        reconcile,
        effectiveTenantId,
        effectiveBranchId,
      );
      if (!reconciliation.inSync) {
        console.warn("[SYNC] Replica divergence detected; executing authoritative bootstrap", reconciliation);
        const bootstrapRes = await this.bootstrapWithServer(defaultBootstrapApi, effectiveTenantId, effectiveBranchId);
        totalPulled += bootstrapRes.applied;
        await this.localDb.refreshStoresFromNative([
          "products", "productVariants", "stockLedger", "stockAdjustments", "productPriceHistory",
          "sales", "payments", "receipts", "customers", "suppliers", "configuration", "syncOutbox", "syncMetadata",
        ]);
        reconciliation = await this.reconcileWithServer(
          reconcile,
          effectiveTenantId,
          effectiveBranchId,
        );
        if (!reconciliation.inSync) {
          throw new Error("SYNC_REPLICA_DIVERGENT: authoritative bootstrap did not converge (" + reconciliation.totalDiscrepancies + " discrepancies)");
        }
      }

      const remainingPending = this.localDb.getPendingOutbox(effectiveTenantId, effectiveBranchId).length;
      const remainingFailed = this.localDb.getFailedOutbox(effectiveTenantId, effectiveBranchId).length;
      if (hadServerRejections || remainingPending > 0 || remainingFailed > 0) {
        throw new Error("SYNC_NOT_VERIFIED: pending=" + remainingPending + " failed=" + remainingFailed);
      }

      globalRumCollector.recordSyncMetrics({
        durationMs: Date.now() - startTime,
        pushedCount,
        deltaCount: totalPulled,
        success: !hadServerRejections,
        outboxDepth: this.localDb.getPendingOutbox(effectiveTenantId, effectiveBranchId).length,
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
        outboxDepth: this.localDb.getPendingOutbox(effectiveTenantId, effectiveBranchId).length,
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
  new LocalIndexedDbStore(AUTHORITATIVE_COMPATIBILITY_MATRIX.schemaVersion),
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

  // Do not rebuild the reconciled variant from the local ledger here: the
  // server snapshot may contain concurrent remote movements that are not yet
  // present in this device's ledger. Rebuild only the parent product summary
  // from the already-reconciled variant projections.
  if (serverSnapshot.productId) {
    const product = db.products.get(serverSnapshot.productId) as any;
    if (product) {
      const variants = [...db.productVariants.values()].filter(
        (v: any) =>
          v.productId === serverSnapshot.productId &&
          v.tenantId === serverSnapshot.tenantId &&
          v.branchId === serverSnapshot.branchId,
      );
      const totalStock = variants
        .filter((v: any) => v.isActive !== false)
        .reduce((sum: number, v: any) => sum + Number(v.inventoryQuantity ?? v.stock ?? 0), 0);
      const updatedProduct = {
        ...product,
        variants,
        hasVariants: variants.length > 0,
        stock: totalStock,
        totalStock,
        availableStock: totalStock,
      };
      db.products.set(serverSnapshot.productId, updatedProduct);
      db.persist("products", serverSnapshot.productId, updatedProduct);
    }
  }

  return reconciledQty;
}

export * from "./rum/rumCollector.js";

