import { LocalIndexedDbStore, assertSyncOutboxEntityTypeAllowed, type OutboxItem, db as defaultDb } from "./indexedDb.js";
import { apiFetch } from "./services/apiClient.js";
import { normalizeSyncPayload } from "./services/payloadValidationService.js";
import {
  createPersistenceStatus,
  emitPersistenceStatusChanged,
  persistenceStatusKey,
} from "./persistence/persistenceStatus.js";

export const db = defaultDb;

const DB_NAME = "kwakopos-v2";
const ATOMIC_MARKER_PREFIX = "atomicMutation:";
const STORE_BY_ENTITY: Record<string, string> = {
  Product: "products",
  ProductVariant: "productVariants",
  StockAdjustment: "stockAdjustments",
  StockLedger: "stockLedger",
  ProductPriceHistory: "productPriceHistory",
  Customer: "customers",
  Supplier: "suppliers",
  Sale: "sales",
  PurchaseReceipt: "receipts",
  Payment: "payments",
  Receipt: "receipts",
};

type AtomicBatch = {
  items: OutboxItem[];
  scheduled: boolean;
};

type PatchedStore = LocalIndexedDbStore & {
  __kwakoAtomicOutboxInstalled?: boolean;
  __kwakoAtomicTail?: Promise<void>;
  __kwakoAtomicPending?: Promise<void>;
  __kwakoAtomicBatch?: AtomicBatch;
};

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `OP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function localUpdatedAt(db: LocalIndexedDbStore, entityType: string, entityId: string): string | null {
  const row = entityType === "Product" ? db.products.get(entityId)
    : entityType === "ProductVariant" ? db.productVariants.get(entityId)
    : entityType === "Customer" ? db.customers.get(entityId)
    : entityType === "Supplier" ? db.suppliers.get(entityId)
    : null;
  const value = row?.updatedAt;
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : null;
}

function scheduleAtomicBatch(db: PatchedStore): void {
  const batch = db.__kwakoAtomicBatch;
  if (!batch || batch.scheduled) return;
  batch.scheduled = true;
  db.__kwakoAtomicPending = new Promise<void>((resolve, reject) => {
    // Wait two microtask turns: this captures both save-before-enqueue and
    // enqueue-before-save synchronous call orders without creating a split commit.
    queueMicrotask(() => {
      queueMicrotask(() => {
        const pending = db.__kwakoAtomicBatch;
        db.__kwakoAtomicBatch = undefined;
        if (!pending?.items.length) {
          resolve();
          return;
        }

        db.__kwakoAtomicTail = (db.__kwakoAtomicTail || Promise.resolve()).catch(() => undefined).then(async () => {
        const stagedWrites = db.drainPendingPersistenceWrites();
        const businessWrites = pending.items.flatMap((item) => {
          const targetStore = STORE_BY_ENTITY[item.entityType];
          if (!targetStore) return [];
          const alreadyStaged = stagedWrites.some((write) => write.store === targetStore && write.key === item.entityId);
          if (alreadyStaged) return [];
          return [{
            store: targetStore as any,
            key: item.entityId,
            value: item.payload,
            delete: item.operationType === "DELETE",
          }];
        });
        const allWrites = [...stagedWrites, ...businessWrites];
        const localCommittedStatuses = pending.items
          .filter((item) => Boolean(item.tenantId))
          .map((item) =>
            createPersistenceStatus(
              {
                tenantId: item.tenantId!,
                branchId: item.branchId,
                entityType: item.entityType,
                entityId: item.entityId,
                operationId: item.id,
                operationType: item.operationType,
              },
              "LOCAL_COMMITTED",
            ),
          );
        const stores = [
          "syncOutbox",
          "syncMetadata",
          ...allWrites.map((write) => write.store),
        ];
        const uniqueStores = [...new Set(stores)];

        const commit = new Promise<void>((commitResolve, commitReject) => {
          const request = indexedDB.open(DB_NAME);
          request.onerror = () => commitReject(request.error || new Error("ATOMIC_OUTBOX_DB_OPEN_FAILED"));
          request.onsuccess = () => {
            const nativeDb = request.result;
            try {
              for (const store of uniqueStores) {
                if (!nativeDb.objectStoreNames.contains(store)) throw new Error(`ATOMIC_OUTBOX_MISSING_STORE:${store}`);
              }
              const tx = nativeDb.transaction(uniqueStores, "readwrite");
              for (const write of allWrites) {
                if (write.delete) tx.objectStore(write.store).delete(write.key);
                else tx.objectStore(write.store).put(write.value, write.key);
              }
              for (const item of pending.items) {
                tx.objectStore("syncOutbox").put(item, item.id);
                const committedStatus = localCommittedStatuses.find((status) => status.operationId === item.id);
                if (committedStatus) {
                  tx.objectStore("syncMetadata").put(
                    JSON.stringify(committedStatus),
                    persistenceStatusKey(committedStatus.tenantId, committedStatus.branchId, committedStatus.entityType, committedStatus.entityId),
                  );
                }
                const marker = JSON.stringify({
                  operationId: item.id,
                  entityType: item.entityType,
                  entityId: item.entityId,
                  operationType: item.operationType,
                  payload: item.payload,
                  committedAt: new Date().toISOString(),
                });
                tx.objectStore("syncMetadata").put(marker, `${ATOMIC_MARKER_PREFIX}${item.id}`);
              }
              tx.oncomplete = () => { nativeDb.close(); commitResolve(); };
              tx.onerror = () => { const error = tx.error || new Error("ATOMIC_OUTBOX_TRANSACTION_FAILED"); nativeDb.close(); commitReject(error); };
              tx.onabort = () => { const error = tx.error || new Error("ATOMIC_OUTBOX_TRANSACTION_ABORTED"); nativeDb.close(); commitReject(error); };
            } catch (error) {
              nativeDb.close();
              commitReject(error);
            }
          };
        });

        try {
          await commit;
        } catch (error) {
          const rollbackStores = [...new Set(allWrites.map((write) => write.store).concat("syncOutbox"))] as any;
          await db.refreshStoresFromNative(rollbackStores).catch(() => undefined);
          throw error;
        }

        for (const status of localCommittedStatuses) {
          const key = persistenceStatusKey(status.tenantId, status.branchId, status.entityType, status.entityId);
          db.syncMetadata.set(key, JSON.stringify(status));
          emitPersistenceStatusChanged(status);
          const item = pending.items.find((candidate) => candidate.id === status.operationId);
          if (item) db.setPersistenceStatus(item, "SYNC_PENDING");
        }
      });

      db.__kwakoAtomicTail.then(resolve, reject);
      });
    });
  });
}

function patchInstance(db: PatchedStore): void {
  if (db.__kwakoAtomicOutboxInstalled) return;
  db.__kwakoAtomicOutboxInstalled = true;
  db.__kwakoAtomicTail = Promise.resolve();

  const originalFlush = db.flushPersistence.bind(db);
  db.flushPersistence = async () => {
    if (db.__kwakoAtomicPending) await db.__kwakoAtomicPending;
    await originalFlush();
    await db.__kwakoAtomicTail;
  };

  db.enqueueOutbox = ((item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>): OutboxItem => {
    const opId = item.id || makeId();
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
    assertSyncOutboxEntityTypeAllowed(String(entityType));
    const entityId = item.entityId || opId;
    const operationType = item.operationType || "CREATE";
    const sourcePayload = item.payload || item.data || {};
    const baseUpdatedAt = localUpdatedAt(db, entityType, entityId);
    const payload = (operationType === "UPDATE" || operationType === "DELETE") && baseUpdatedAt && !sourcePayload._baseUpdatedAt
      ? { ...sourcePayload, _baseUpdatedAt: baseUpdatedAt }
      : sourcePayload;
    const outboxItem: OutboxItem = {
      id: opId,
      entityType,
      entityId,
      operationType,
      payload,
      clientCreatedAt: item.clientCreatedAt || new Date().toISOString(),
      idempotencyKey: item.idempotencyKey || opId,
      status: "PENDING",
      tenantId: item.tenantId,
      branchId: item.branchId,
    };

    db.syncOutbox.set(opId, outboxItem);
    const batch = db.__kwakoAtomicBatch || { items: [], scheduled: false };
    batch.items.push(outboxItem);
    db.__kwakoAtomicBatch = batch;
    scheduleAtomicBatch(db);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { item: outboxItem } }));
        if ("BroadcastChannel" in window) {
          const bc = new BroadcastChannel("kwakopos_sync_channel");
          bc.postMessage({
            type: "OUTBOX_MUTATION",
            tenantId: outboxItem.tenantId,
            branchId: outboxItem.branchId,
            operationId: outboxItem.id,
            entityType: outboxItem.entityType,
            entityId: outboxItem.entityId,
            timestamp: Date.now(),
          });
          bc.close();
        }
      }
    } catch {
      /* ignore broadcast error */
    }
    return outboxItem;
  }) as PatchedStore["enqueueOutbox"];
}

export function installAtomicOutboxBoundary(): void {
  const prototype = LocalIndexedDbStore.prototype as PatchedStore;
  const originalConstructorLike = prototype.enqueueOutbox;
  if ((prototype as any).__kwakoPrototypePatched) return;
  (prototype as any).__kwakoPrototypePatched = true;
  prototype.enqueueOutbox = function patchedEnqueue(this: LocalIndexedDbStore, ...args: any[]) {
    patchInstance(this as PatchedStore);
    return (this as PatchedStore).enqueueOutbox.apply(this, args as any);
  } as PatchedStore["enqueueOutbox"];
  (prototype as any).__kwakoOriginalEnqueue = originalConstructorLike;
}

installAtomicOutboxBoundary();

export async function enqueueOutbox(tx: any, targetDb: LocalIndexedDbStore = defaultDb): Promise<OutboxItem> {
  try {
    if (!tx) throw new Error("Transaction payload is required");
    let item: OutboxItem;
    if (tx.entityType || tx.entity || tx.payload || tx.operationType) {
      assertSyncOutboxEntityTypeAllowed(String(tx.entityType || tx.entity || "Product"));
      item = targetDb.enqueueOutbox(tx);
    } else {
      const opId = tx.id || tx.transactionId || makeId();
      const outboxItem: OutboxItem = {
        id: opId,
        entityType: (tx.entityType || "Sale") as any,
        entityId: tx.id || opId,
        operationType: tx.operationType || "CREATE",
        payload: tx.payload || tx,
        clientCreatedAt: tx.clientCreatedAt || tx.createdAt || new Date().toISOString(),
        idempotencyKey: tx.idempotencyKey || opId,
        status: "PENDING",
        tenantId: tx.tenantId,
        branchId: tx.branchId,
      };
      await targetDb.outbox.add(outboxItem);
      targetDb.setPersistenceStatus(outboxItem, "SYNC_PENDING");
      item = outboxItem;
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { item: outboxItem } }));
          if ("BroadcastChannel" in window) {
            const bc = new BroadcastChannel("kwakopos_sync_channel");
            bc.postMessage({
              type: "OUTBOX_MUTATION",
              tenantId: outboxItem.tenantId,
              branchId: outboxItem.branchId,
              operationId: outboxItem.id,
              entityType: outboxItem.entityType,
              entityId: outboxItem.entityId,
              timestamp: Date.now(),
            });
            bc.close();
          }
        }
      } catch {
        /* ignore broadcast error */
      }
    }
    await targetDb.flushPersistence().catch(() => {});
    return item;
  } catch (err) {
    console.error("Failed to enqueue:", err);
    throw err; // never swallow
  }
}

export async function retryWithBackoff(
  fn: () => Promise<void>,
  opts: {
    retries: number;
    baseDelay: number;
    factor: number;
    onFailure: (err: any) => Promise<void> | void;
  }
): Promise<void> {
  let delay = opts.baseDelay;
  for (let i = 0; i < opts.retries; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === opts.retries - 1) {
        await opts.onFailure(err);
        return;
      }
      await new Promise((res) => setTimeout(res, delay));
      delay *= opts.factor;
    }
  }
}

async function defaultApiPush(item: OutboxItem): Promise<any> {
  const normalizedPayload = normalizeSyncPayload(
    item.entityType,
    item.operationType,
    item.payload,
    {
      deviceId: "pos-terminal",
      operationId: item.id,
      idempotencyKey: item.idempotencyKey,
      entityId: item.entityId,
    }
  );

  const body = {
    deviceId: "pos-terminal",
    operations: [
      {
        operationId: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operationType: item.operationType,
        payload: normalizedPayload,
        clientCreatedAt: item.clientCreatedAt,
        idempotencyKey: item.idempotencyKey,
      },
    ],
  };

  const res = await apiFetch<any>("/sync/push", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res?.data || res;
}

export async function processOutbox(opts?: {
  db?: LocalIndexedDbStore;
  apiPush?: (item: OutboxItem) => Promise<any>;
  retries?: number;
  baseDelay?: number;
  factor?: number;
  tenantId?: string;
  branchId?: string;
}): Promise<{ processed: number; succeeded: number; failed: number }> {
  const targetDb = opts?.db || defaultDb;
  const pushFn = opts?.apiPush || defaultApiPush;
  const retries = opts?.retries ?? 5;
  const baseDelay = opts?.baseDelay ?? 500;
  const factor = opts?.factor ?? 2;

  const allPending = await targetDb.outbox.where("status").equals("PENDING").toArray();
  const scopes = new Set(
    allPending
      .filter((item) => Boolean(item.tenantId))
      .map((item) => `${item.tenantId}:${item.branchId || ""}`),
  );

  const inferredTenantId = opts?.tenantId || (scopes.size === 1 ? String(allPending.find((item) => item.tenantId)?.tenantId) : undefined);
  const inferredBranchId = opts?.branchId || (scopes.size === 1 ? allPending.find((item) => item.tenantId)?.branchId : undefined);

  if (scopes.size > 1 && (!opts?.tenantId || !opts?.branchId)) {
    throw new Error("SYNC_CONTEXT_REQUIRED: tenantId and branchId are required when multiple outbox scopes are pending");
  }

  const items = allPending.filter((item) => {
    if (!inferredTenantId || !inferredBranchId) return !item.tenantId && !item.branchId;
    return item.tenantId === inferredTenantId && item.branchId === inferredBranchId;
  });

  for (const item of items) {
    if (!item.tenantId || !item.branchId) {
      throw new Error("SYNC_CONTEXT_REQUIRED: every production outbox mutation must carry tenantId and branchId");
    }
  }
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    await retryWithBackoff(
      async () => {
        await pushFn(item);
        await targetDb.outbox.update(item.id, { status: "SUCCESS" } as any);
        targetDb.markOutboxSynced(item.id);
        succeeded += 1;
      },
      {
        retries,
        baseDelay,
        factor,
        onFailure: async (err: any) => {
          console.error("Outbox push failed:", err);
          const errorMsg = err instanceof Error ? err.message : String(err);
          await targetDb.outbox.update(item.id, { status: "FAILED", error: errorMsg } as any);
          targetDb.markOutboxFailed(item.id, errorMsg);
          failed += 1;
        },
      }
    );
  }

  await targetDb.flushPersistence().catch(() => {});
  return { processed: items.length, succeeded, failed };
}