import type { Product, ProductVariant, StockLedger, StockAdjustment, SyncOperationType } from "@kwakopos2/contracts";

export interface OutboxItem {
  id: string;
  entityType: "Product" | "ProductVariant" | "StockAdjustment" | "StockLedger" | "Sale" | "Customer" | "PurchaseOrder" | "PurchaseReceipt" | "Payment";
  entityId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  idempotencyKey: string;
  status: "PENDING" | "SYNCED" | "FAILED";
}

type NativeStore = "products" | "productVariants" | "stockLedger" | "stockAdjustments" | "syncOutbox" | "syncMetadata";

/**
 * Durable browser-local operational store with a synchronous Map facade for
 * current UI callers. IndexedDB persistence is best-effort and hydrated on startup.
 */
export class LocalIndexedDbStore {
  schemaVersion = 1;
  products = new Map<string, Product>();
  productVariants = new Map<string, ProductVariant>();
  stockLedger = new Map<string, StockLedger>();
  stockAdjustments = new Map<string, StockAdjustment>();
  syncOutbox = new Map<string, OutboxItem>();
  syncMetadata = new Map<string, string>();
  readonly ready: Promise<void>;
  private nativeDb: IDBDatabase | null = null;

  constructor() {
    this.ready = this.initializeNativePersistence();
  }

  private async initializeNativePersistence(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    this.nativeDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("kwakopos-v2", this.schemaVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of ["products", "productVariants", "stockLedger", "stockAdjustments", "syncOutbox", "syncMetadata"]) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });

    await Promise.all([
      this.hydrateMap("products", this.products),
      this.hydrateMap("productVariants", this.productVariants),
      this.hydrateMap("stockLedger", this.stockLedger),
      this.hydrateMap("stockAdjustments", this.stockAdjustments),
      this.hydrateMap("syncOutbox", this.syncOutbox),
      this.hydrateMap("syncMetadata", this.syncMetadata),
    ]);

    const storedSchema = this.syncMetadata.get("schemaVersion");
    if (storedSchema) this.schemaVersion = Number(storedSchema) || this.schemaVersion;
  }

  private hydrateMap<T>(store: NativeStore, target: Map<string, T>): Promise<void> {
    if (!this.nativeDb) return Promise.resolve();
    return new Promise((resolve) => {
      const request = this.nativeDb!.transaction(store, "readonly").objectStore(store).getAllKeys();
      request.onsuccess = () => {
        const keys = request.result as IDBValidKey[];
        if (!keys.length) return resolve();
        const tx = this.nativeDb!.transaction(store, "readonly");
        const objectStore = tx.objectStore(store);
        for (const key of keys) {
          const get = objectStore.get(key);
          get.onsuccess = () => target.set(String(key), get.result as T);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      request.onerror = () => resolve();
    });
  }

  private persist<T>(store: NativeStore, key: string, value: T): void {
    if (!this.nativeDb) return;
    try {
      const tx = this.nativeDb.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
    } catch {
      // Local persistence must never make an already-successful UI mutation throw.
    }
  }

  private removePersisted(store: NativeStore, key: string): void {
    if (!this.nativeDb) return;
    try { this.nativeDb.transaction(store, "readwrite").objectStore(store).delete(key); } catch { /* best effort */ }
  }

  clear(): void {
    this.products.clear();
    this.productVariants.clear();
    this.stockLedger.clear();
    this.stockAdjustments.clear();
    this.syncOutbox.clear();
    this.syncMetadata.clear();
    if (this.nativeDb) {
      for (const store of ["products", "productVariants", "stockLedger", "stockAdjustments", "syncOutbox", "syncMetadata"] as NativeStore[]) {
        try { this.nativeDb.transaction(store, "readwrite").objectStore(store).clear(); } catch { /* best effort */ }
      }
    }
  }

  saveProductLocal(product: Product): void {
    this.products.set(product.id, product);
    this.persist("products", product.id, product);
    for (const variant of product.variants || []) this.saveVariantLocal(variant);
  }

  saveVariantLocal(variant: ProductVariant): void {
    this.productVariants.set(variant.id, variant);
    this.persist("productVariants", variant.id, variant);
  }

  recordOutboxMutation(item: OutboxItem): void {
    this.syncOutbox.set(item.id, item);
    this.persist("syncOutbox", item.id, item);
  }

  enqueueOutbox(item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>): OutboxItem {
    const opId = item.id || `OP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
    const outboxItem: OutboxItem = {
      id: opId,
      entityType,
      entityId: item.entityId || opId,
      operationType: item.operationType || "CREATE",
      payload: item.payload || item.data || {},
      clientCreatedAt: item.clientCreatedAt || new Date().toISOString(),
      idempotencyKey: item.idempotencyKey || opId,
      status: "PENDING",
    };
    this.recordOutboxMutation(outboxItem);
    return outboxItem;
  }

  getPendingOutbox(): OutboxItem[] {
    return [...this.syncOutbox.values()].filter((item) => item.status === "PENDING");
  }

  markOutboxSynced(operationId: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item) return;
    item.status = "SYNCED";
    this.persist("syncOutbox", operationId, item);
  }

  markOutboxFailed(operationId: string, errorReason: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item) return;
    item.status = "FAILED";
    this.syncMetadata.set(`error_${operationId}`, errorReason);
    this.persist("syncOutbox", operationId, item);
    this.persist("syncMetadata", `error_${operationId}`, errorReason);
  }

  setSyncMetadata(key: string, value: string): void {
    this.syncMetadata.set(key, value);
    this.persist("syncMetadata", key, value);
  }

  migrateToVersion(targetVersion: number): { previousVersion: number; newVersion: number; preservedOutboxCount: number } {
    const previousVersion = this.schemaVersion;
    const preservedOutboxCount = this.getPendingOutbox().length;
    if (targetVersion > previousVersion) {
      this.schemaVersion = targetVersion;
      this.setSyncMetadata("schemaVersion", String(targetVersion));
      this.setSyncMetadata("lastMigratedAt", new Date().toISOString());
    }
    return { previousVersion, newVersion: this.schemaVersion, preservedOutboxCount };
  }
}
