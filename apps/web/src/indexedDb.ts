import type { Product, ProductVariant, StockLedger, StockAdjustment, ProductBranchStock, ProductPriceHistory, SyncOperationType, SyncDeltaResponse } from "@kwakopos2/contracts";

export interface OutboxItem {
  id: string;
  entityType: "Product" | "ProductVariant" | "StockAdjustment" | "StockLedger" | "ProductPriceHistory" | "Sale" | "Customer" | "PurchaseOrder" | "PurchaseReceipt" | "Payment" | "User" | "Receipt";
  entityId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  idempotencyKey: string;
  status: "PENDING" | "SYNCED" | "FAILED";
}

type NativeStore = "products" | "productVariants" | "stockLedger" | "stockAdjustments" | "stockBalance" | "productPriceHistory" | "receipts" | "syncOutbox" | "syncMetadata";
const STORE_NAMES: NativeStore[] = ["products", "productVariants", "stockLedger", "stockAdjustments", "stockBalance", "productPriceHistory", "receipts", "syncOutbox", "syncMetadata"];
const DB_NAME = "kwakopos-v2";
const DEFAULT_SCHEMA_VERSION = 1;

/** Durable browser-local operational store with IndexedDB persistence. */
export class LocalIndexedDbStore {
  schemaVersion: number;
  products = new Map<string, Product>();
  productVariants = new Map<string, ProductVariant>();
  stockLedger = new Map<string, StockLedger>();
  stockAdjustments = new Map<string, StockAdjustment>();
  stockBalance = new Map<string, ProductBranchStock>();
  productPriceHistory = new Map<string, ProductPriceHistory>();
  receipts = new Map<string, any>();
  syncOutbox = new Map<string, OutboxItem>();
  syncMetadata = new Map<string, string>();
  readonly ready: Promise<void>;
  private nativeDb: IDBDatabase | null = null;
  private persistenceTail: Promise<void> = Promise.resolve();

  constructor(requestedSchemaVersion = DEFAULT_SCHEMA_VERSION) {
    this.schemaVersion = Number.isInteger(requestedSchemaVersion) && requestedSchemaVersion > 0 ? requestedSchemaVersion : DEFAULT_SCHEMA_VERSION;
    this.ready = this.initializeNativePersistence();
  }

  private async initializeNativePersistence(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    this.nativeDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, this.schemaVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORE_NAMES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
    await Promise.all(STORE_NAMES.map((store) => this.hydrateMap(store, this.getTargetMap(store))));
    const storedSchema = this.syncMetadata.get("schemaVersion");
    if (storedSchema) this.schemaVersion = Math.max(this.schemaVersion, Number(storedSchema) || this.schemaVersion);
    this.setSyncMetadata("schemaVersion", String(this.schemaVersion));
    await this.flushPersistence();
  }

  private getTargetMap(store: NativeStore): Map<string, any> {
    switch (store) {
      case "products": return this.products;
      case "productVariants": return this.productVariants;
      case "stockLedger": return this.stockLedger;
      case "stockAdjustments": return this.stockAdjustments;
      case "stockBalance": return this.stockBalance;
      case "productPriceHistory": return this.productPriceHistory;
      case "receipts": return this.receipts;
      case "syncOutbox": return this.syncOutbox;
      case "syncMetadata": return this.syncMetadata;
    }
  }

  private hydrateMap<T>(store: NativeStore, target: Map<string, T>): Promise<void> {
    if (!this.nativeDb) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this.nativeDb!.transaction(store, "readonly");
      const request = tx.objectStore(store).getAll();
      const keyRequest = tx.objectStore(store).getAllKeys();
      let values: T[] | null = null;
      let keys: IDBValidKey[] | null = null;
      const finish = () => {
        if (!values || !keys) return;
        for (let index = 0; index < Math.min(keys.length, values.length); index++) target.set(String(keys[index]), values[index]);
      };
      request.onsuccess = () => { values = request.result as T[]; finish(); };
      keyRequest.onsuccess = () => { keys = keyRequest.result as IDBValidKey[]; finish(); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`IndexedDB read failed: ${store}`));
      tx.onabort = () => reject(tx.error || new Error(`IndexedDB read aborted: ${store}`));
    });
  }

  private persist<T>(store: NativeStore, key: string, value: T): void {
    if (!this.nativeDb) return;
    this.persistenceTail = this.persistenceTail.then(() => new Promise<void>((resolve, reject) => {
      try {
        const tx = this.nativeDb!.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB write failed: ${store}`));
        tx.onabort = () => reject(tx.error || new Error(`IndexedDB write aborted: ${store}`));
      } catch (error) {
        reject(error);
      }
    }));
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceTail;
  }

  clear(): void {
    this.products.clear(); this.productVariants.clear(); this.stockLedger.clear(); this.stockAdjustments.clear(); this.stockBalance.clear(); this.productPriceHistory.clear(); this.syncOutbox.clear(); this.syncMetadata.clear();
    if (this.nativeDb) for (const store of STORE_NAMES) {
      try { this.nativeDb.transaction(store, "readwrite").objectStore(store).clear(); } catch { /* best effort */ }
    }
  }

  saveProductLocal(product: Product): void { this.products.set(product.id, product); this.persist("products", product.id, product); for (const variant of product.variants || []) this.saveVariantLocal(variant); }
  saveVariantLocal(variant: ProductVariant): void { this.productVariants.set(variant.id, variant); this.persist("productVariants", variant.id, variant); }
  saveStockLedgerLocal(entry: StockLedger): void { this.stockLedger.set(entry.id, entry); this.persist("stockLedger", entry.id, entry); }
  saveStockAdjustmentLocal(adjustment: StockAdjustment): void { this.stockAdjustments.set(adjustment.id, adjustment); this.persist("stockAdjustments", adjustment.id, adjustment); }
  saveStockBalanceLocal(balance: ProductBranchStock): void { this.stockBalance.set(balance.id, balance); this.persist("stockBalance", balance.id, balance); }
  saveProductPriceHistoryLocal(history: ProductPriceHistory): void { this.productPriceHistory.set(history.id, history); this.persist("productPriceHistory", history.id, history); }
  recordOutboxMutation(item: OutboxItem): void { this.syncOutbox.set(item.id, item); this.persist("syncOutbox", item.id, item); }

  /** Apply one server delta as a single IndexedDB transaction. The sync cursor is advanced only after all records commit. */
  async applyServerDelta(delta: SyncDeltaResponse): Promise<number> {
    await this.ready;
    if (!this.nativeDb) {
      for (const product of delta.products) this.saveProductLocal(product);
      for (const variant of delta.variants) this.saveVariantLocal(variant);
      for (const ledger of delta.stockLedger) this.saveStockLedgerLocal(ledger);
      for (const adjustment of delta.adjustments) this.saveStockAdjustmentLocal(adjustment);
      await this.flushPersistence();
      this.setSyncMetadata("lastSyncTime", delta.serverTimestamp);
      await this.flushPersistence();
      return delta.products.length + delta.variants.length + delta.stockLedger.length + delta.adjustments.length;
    }

    const tx = this.nativeDb.transaction(["products", "productVariants", "stockLedger", "stockAdjustments", "syncMetadata"], "readwrite");
    tx.objectStore("products");
    for (const product of delta.products) {
      tx.objectStore("products").put(product, product.id);
      this.products.set(product.id, product);
      for (const variant of product.variants || []) {
        tx.objectStore("productVariants").put(variant, variant.id);
        this.productVariants.set(variant.id, variant);
      }
    }
    for (const variant of delta.variants) {
      tx.objectStore("productVariants").put(variant, variant.id);
      this.productVariants.set(variant.id, variant);
    }
    for (const ledger of delta.stockLedger) {
      tx.objectStore("stockLedger").put(ledger, ledger.id);
      this.stockLedger.set(ledger.id, ledger);
    }
    for (const adjustment of delta.adjustments) {
      tx.objectStore("stockAdjustments").put(adjustment, adjustment.id);
      this.stockAdjustments.set(adjustment.id, adjustment);
    }
    tx.objectStore("syncMetadata").put(delta.serverTimestamp, "lastSyncTime");

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB sync transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB sync transaction aborted"));
    });
    this.syncMetadata.set("lastSyncTime", delta.serverTimestamp);
    return delta.products.length + delta.variants.length + delta.stockLedger.length + delta.adjustments.length;
  }

  enqueueOutbox(item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>): OutboxItem {
    const opId = item.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `OP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
    const outboxItem: OutboxItem = { id: opId, entityType, entityId: item.entityId || opId, operationType: item.operationType || "CREATE", payload: item.payload || item.data || {}, clientCreatedAt: item.clientCreatedAt || new Date().toISOString(), idempotencyKey: item.idempotencyKey || opId, status: "PENDING" };
    this.recordOutboxMutation(outboxItem);
    return outboxItem;
  }

  getPendingOutbox(): OutboxItem[] { return [...this.syncOutbox.values()].filter((item) => item.status === "PENDING"); }
  getFailedOutbox(): OutboxItem[] { return [...this.syncOutbox.values()].filter((item) => item.status === "FAILED"); }
  retryOutbox(operationId: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item || item.status !== "FAILED") return;
    item.status = "PENDING";
    this.syncMetadata.delete(`error_${operationId}`);
    this.persist("syncOutbox", operationId, item);
    if (this.nativeDb) this.persistDelete("syncMetadata", `error_${operationId}`);
  }
  markOutboxSynced(operationId: string): void { const item = this.syncOutbox.get(operationId); if (!item) return; item.status = "SYNCED"; this.persist("syncOutbox", operationId, item); }
  markOutboxFailed(operationId: string, errorReason: string): void { const item = this.syncOutbox.get(operationId); if (!item) return; item.status = "FAILED"; this.syncMetadata.set(`error_${operationId}`, errorReason); this.persist("syncOutbox", operationId, item); this.persist("syncMetadata", `error_${operationId}`, errorReason); }
  setSyncMetadata(key: string, value: string): void { this.syncMetadata.set(key, value); this.persist("syncMetadata", key, value); }

  private persistDelete(store: NativeStore, key: string): void {
    if (!this.nativeDb) return;
    this.persistenceTail = this.persistenceTail.then(() => new Promise<void>((resolve, reject) => {
      try {
        const tx = this.nativeDb!.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB delete failed: ${store}`));
        tx.onabort = () => reject(tx.error || new Error(`IndexedDB delete aborted: ${store}`));
      } catch (error) { reject(error); }
    }));
  }

  migrateToVersion(targetVersion: number): { previousVersion: number; newVersion: number; preservedOutboxCount: number } {
    const previousVersion = this.schemaVersion;
    const preservedOutboxCount = this.getPendingOutbox().length;
    if (!Number.isInteger(targetVersion) || targetVersion <= previousVersion) return { previousVersion, newVersion: previousVersion, preservedOutboxCount };
    this.schemaVersion = targetVersion;
    this.setSyncMetadata("schemaVersion", String(targetVersion));
    this.setSyncMetadata("lastMigratedAt", new Date().toISOString());
    return { previousVersion, newVersion: targetVersion, preservedOutboxCount };
  }
}
