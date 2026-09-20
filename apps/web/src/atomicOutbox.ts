import { LocalIndexedDbStore, type OutboxItem, db as defaultDb } from "./indexedDb.js";

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
  Sale: "receipts",
  PurchaseReceipt: "receipts",
  Payment: "receipts",
  Receipt: "receipts",
};

type PatchedStore = LocalIndexedDbStore & {
  __kwakoAtomicOutboxInstalled?: boolean;
  __kwakoAtomicTail?: Promise<void>;
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

function patchInstance(db: PatchedStore): void {
  if (db.__kwakoAtomicOutboxInstalled) return;
  db.__kwakoAtomicOutboxInstalled = true;
  db.__kwakoAtomicTail = Promise.resolve();

  const originalFlush = db.flushPersistence.bind(db);
  db.flushPersistence = async () => {
    await originalFlush();
    await db.__kwakoAtomicTail;
  };

  db.enqueueOutbox = ((item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>): OutboxItem => {
    const opId = item.id || makeId();
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
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
    };

    db.syncOutbox.set(opId, outboxItem);
    const targetStore = STORE_BY_ENTITY[entityType];
    const deleting = operationType === "DELETE";
    const map = targetStore === "products" ? db.products
      : targetStore === "productVariants" ? db.productVariants
      : targetStore === "stockAdjustments" ? db.stockAdjustments
      : targetStore === "stockLedger" ? db.stockLedger
      : targetStore === "productPriceHistory" ? db.productPriceHistory
      : targetStore === "customers" ? db.customers
      : targetStore === "suppliers" ? db.suppliers
      : targetStore === "receipts" ? db.receipts
      : null;
    const hadPrevious = Boolean(map?.has(entityId));
    const previousValue = map?.get(entityId);
    if (map) deleting ? map.delete(entityId) : map.set(entityId, payload as any);

    const restoreMemory = () => { if (!map) return; if (hadPrevious) map.set(entityId, previousValue as any); else map.delete(entityId); };

    const marker = JSON.stringify({ operationId: opId, entityType, entityId, operationType, payload, committedAt: new Date().toISOString() });
    db.__kwakoAtomicTail = db.__kwakoAtomicTail!.catch(() => undefined).then(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => reject(request.error || new Error("ATOMIC_OUTBOX_DB_OPEN_FAILED"));
      request.onsuccess = () => {
        const nativeDb = request.result;
        try {
          const stores = ["syncOutbox", "syncMetadata", ...(targetStore ? [targetStore] : [])];
          const uniqueStores = [...new Set(stores)];
          const tx = nativeDb.transaction(uniqueStores, "readwrite");
          // native IndexedDB transaction: business record + outbox + atomic marker commit or roll back together.
          tx.objectStore("syncOutbox").put(outboxItem, opId);
          tx.objectStore("syncMetadata").put(marker, `${ATOMIC_MARKER_PREFIX}${opId}`);
          if (targetStore) {
            if (deleting) tx.objectStore(targetStore).delete(entityId);
            else tx.objectStore(targetStore).put(payload, entityId);
          }
          tx.oncomplete = () => { nativeDb.close(); resolve(); };
          tx.onerror = () => { const error = tx.error || new Error("ATOMIC_OUTBOX_TRANSACTION_FAILED"); restoreMemory(); nativeDb.close(); reject(error); };
          tx.onabort = () => { const error = tx.error || new Error("ATOMIC_OUTBOX_TRANSACTION_ABORTED"); restoreMemory(); nativeDb.close(); reject(error); };
        } catch (error) {
          nativeDb.close();
          reject(error);
        }
      };
    }));

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
      item = outboxItem;
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
  const endpoint = item.entityType === "Sale" ? "/api/v1/pos/sales" : "/sync/push";
  const body =
    item.entityType === "Sale"
      ? item.payload
      : {
          deviceId: "pos-terminal",
          operations: [
            {
              operationId: item.id,
              entityType: item.entityType,
              entityId: item.entityId,
              operationType: item.operationType,
              payload: item.payload,
              clientCreatedAt: item.clientCreatedAt,
              idempotencyKey: item.idempotencyKey,
            },
          ],
        };
  const token =
    typeof window !== "undefined" && window.localStorage
      ? localStorage.getItem("kwakopos_access_token")
      : null;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API push failed with HTTP ${res.status}`);
  }
  return res.json();
}

export async function processOutbox(opts?: {
  db?: LocalIndexedDbStore;
  apiPush?: (item: OutboxItem) => Promise<any>;
  retries?: number;
  baseDelay?: number;
  factor?: number;
}): Promise<{ processed: number; succeeded: number; failed: number }> {
  const targetDb = opts?.db || defaultDb;
  const pushFn = opts?.apiPush || defaultApiPush;
  const retries = opts?.retries ?? 5;
  const baseDelay = opts?.baseDelay ?? 500;
  const factor = opts?.factor ?? 2;

  const items = await targetDb.outbox.where("status").equals("PENDING").toArray();
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