import { LocalIndexedDbStore, type OutboxItem } from "./indexedDb.js";

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

    // The business payload and its durable outbox entry are committed by one native
    // IndexedDB transaction. A crash cannot leave one without the other.
    db.syncOutbox.set(opId, outboxItem);
    const targetStore = STORE_BY_ENTITY[entityType];
    if (targetStore === "products") db.products.set(entityId, payload as any);
    else if (targetStore === "productVariants") db.productVariants.set(entityId, payload as any);
    else if (targetStore === "stockAdjustments") db.stockAdjustments.set(entityId, payload as any);
    else if (targetStore === "stockLedger") db.stockLedger.set(entityId, payload as any);
    else if (targetStore === "productPriceHistory") db.productPriceHistory.set(entityId, payload as any);
    else if (targetStore === "customers") db.customers.set(entityId, payload as any);
    else if (targetStore === "suppliers") db.suppliers.set(entityId, payload as any);
    else if (targetStore === "receipts") db.receipts.set(entityId, payload);

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
          tx.objectStore("syncOutbox").put(outboxItem, opId);
          tx.objectStore("syncMetadata").put(marker, `${ATOMIC_MARKER_PREFIX}${opId}`);
          if (targetStore) tx.objectStore(targetStore).put(payload, entityId);
          tx.oncomplete = () => { nativeDb.close(); resolve(); };
          tx.onerror = () => { const error = tx.error || new Error("ATOMIC_OUTBOX_TRANSACTION_FAILED"); nativeDb.close(); reject(error); };
          tx.onabort = () => { const error = tx.error || new Error("ATOMIC_OUTBOX_TRANSACTION_ABORTED"); nativeDb.close(); reject(error); };
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
