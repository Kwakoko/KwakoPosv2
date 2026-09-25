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
import { apiFetch } from "./services/apiClient.js";

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

async function applyRevisionedChanges(changes: RevisionedChange[], serverRevision: string, serverTimestamp: string, tenantId: string, branchId: string): Promise<number> {
  if (typeof indexedDB === "undefined") throw new Error("SYNC_LOCAL_STORAGE_UNAVAILABLE");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });

  const tx = db.transaction(KNOWN_STORES as unknown as string[], "readwrite");
  const revisionKey = scopedSyncKey(tenantId, branchId, "lastSyncRevision");
  const syncTimeKey = scopedSyncKey(tenantId, branchId, "lastSyncTime");
  const categoryKey = tenantId + ":" + branchId + ":inventory_categories_meta";
  const brandKey = tenantId + ":" + branchId + ":inventory_brands_meta";
  const metadata = tx.objectStore("syncMetadata");
  const configuration = tx.objectStore("configuration");
  const outbox = tx.objectStore("syncOutbox");
  const pending = (await new Promise<any[]>((resolve, reject) => {
    const request = outbox.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Outbox read failed"));
  })).filter((item) => item?.status === "PENDING");

  let applied = 0;
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
      metadata.put(JSON.stringify({ conflictId: "CONFLICT-" + change.entityType + "-" + change.entityId + "-" + change.revision, revision: change.revision, entityType: change.entityType, entityId: change.entityId, operationId: pendingMutation.id, localPayload: pendingMutation.payload, remoteRecord: change.record, detectedAt: new Date().toISOString(), status: "OPEN" }), "sync_conflict_" + change.entityType + "_" + change.entityId);
      break;
    }

    const storeName = storeForEntity(change.entityType);
    const deleted = change.operationType === "DELETE" || Boolean(change.record?._deleted);
    if (change.entityType === "Category" || change.entityType === "Brand") {
      await upsertCatalogConfig(change.entityType, change, deleted);
    } else if (deleted) {
      if (storeName) await waitRequest(tx.objectStore(storeName).delete(change.entityId));
      metadata.put(JSON.stringify({ revision: change.revision, entityType: change.entityType, entityId: change.entityId, deletedAt: new Date().toISOString() }), "tombstone:" + change.entityType + ":" + change.entityId);
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
      clientVersion: "2.12.5",
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
  ): Promise<SyncReconciliationResponse> {
    await this.localDb.ready;
    const branchId = this.defaultBranchId || "branch-default";
    const manifest = this.localDb.generateStateManifest(this.deviceId, tenantId, branchId);
    const report = await reconcileApiFn(manifest);
    this.lastReconciliationStatus = report.inSync ? "IN_SYNC" : "DIVERGENT";
    this.localDb.setSyncMetadata("reconciliationStatus", this.lastReconciliationStatus);
    this.localDb.setSyncMetadata("lastReconciliationTime", report.evaluatedAt);
    return report;
  }

  getObservabilityStatus(tenantId?: string): SyncObservabilityStatus {
    const branch = this.defaultBranchId || "branch-default";
    const pendingOutbox = this.localDb.getPendingOutbox(tenantId, branch);
    const failedOutbox = this.localDb.getFailedOutbox(tenantId, branch);
    const scopedTenant = tenantId || this.defaultTenantId || "tenant-default";
    const lastSync = this.localDb.syncMetadata.get(scopedSyncKey(scopedTenant, branch, "lastSyncTime")) || null;
    const lastBootstrap = this.localDb.syncMetadata.get(scopedSyncKey(scopedTenant, branch, "lastBootstrapTime")) || null;
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
    branchId?: string,
  ): Promise<{ pushed: number; pulled: number }> {
    if (globalClientCoordination.isClientQuiesced()) {
      console.info("[SYNC] Client is quiesced for PWA migration; deferring synchronization cycle.");
      return { pushed: 0, pulled: 0 };
    }

    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.runSync(pushApiFn, deltaApiFn, tenantId, branchId).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  public async runSync(
    pushApiFn?: (req: SyncPushRequest) => Promise<SyncPushResponse>,
    deltaApiFn?: (since?: string) => Promise<SyncDeltaResponse>,
    tenantId?: string,
    branchId?: string,
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
            let normalizedPayload = op.payload;
            if (op.entityType === "Sale" && normalizedPayload) {
              const rawItems = Array.isArray(normalizedPayload.items)
                ? normalizedPayload.items
                : Array.isArray(normalizedPayload.cart)
                ? normalizedPayload.cart
                : [];
              normalizedPayload = {
                ...normalizedPayload,
                id: op.entityId || normalizedPayload.id,
                deviceId: this.deviceId,
                operationId: op.id,
                idempotencyKey: op.idempotencyKey || op.id,
                items: rawItems.map((it: any) => ({
                  productId: String(it.productId || it.product?.id || it.id || "prod_unknown"),
                  variantId: String(it.variantId || `${it.productId || it.product?.id || it.id || "prod"}-default`),
                  quantity: Number(it.quantity || it.qty || 1),
                  unitPrice: Number(it.unitPrice ?? it.price ?? it.product?.price ?? 0),
                  unitCost: Number(it.unitCost ?? it.costPrice ?? (it.product as any)?.costPrice ?? (it.product as any)?.buyingPrice ?? 0),
                  discountAmount: Number(it.discountAmount || 0),
                  taxAmount: Number(it.taxAmount || 0),
                })),
                payments: normalizedPayload.payments || [
                  {
                    amount: Number(normalizedPayload.grandTotal || normalizedPayload.totalAmount || normalizedPayload.total || 0),
                    paymentMethod: "CASH",
                  },
                ],
              };
            }
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
            this.localDb.markOutboxFailed(res.operationId, res.error || "Server rejected operation");
          } else throw new Error("SYNC_PROTOCOL_VIOLATION: unknown operation status");
        }
        await this.localDb.flushPersistence();
      }

      const lastRevision = this.localDb.syncMetadata.get(scopedSyncKey(effectiveTenantId, effectiveBranchId, "lastSyncRevision")) || "0";
      const deltaRes = (await effectiveDelta(`rev:${lastRevision}`)) as any;
      if (!deltaRes || typeof deltaRes.serverTimestamp !== "string")
        throw new Error("SYNC_PROTOCOL_VIOLATION: delta response is missing serverTimestamp");
      let totalPulled = 0;
      if (typeof deltaRes.serverRevision === "string" && Array.isArray(deltaRes.changes)) {
        totalPulled = await applyRevisionedChanges(
          deltaRes.changes as RevisionedChange[],
          deltaRes.serverRevision,
          deltaRes.serverTimestamp,
          effectiveTenantId || "tenant-default",
          effectiveBranchId
        );
        await this.localDb.refreshStoresFromNative([
          "products", "productVariants", "stockLedger", "stockAdjustments", "productPriceHistory",
          "sales", "payments", "receipts", "customers", "suppliers", "configuration", "syncOutbox", "syncMetadata",
        ]);
      } else {
        totalPulled = await this.localDb.applyServerDelta(deltaRes);
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

