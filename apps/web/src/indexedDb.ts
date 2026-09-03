import type { Product, ProductVariant, StockLedger, StockAdjustment, ProductBranchStock, ProductPriceHistory, SyncOperationType, SyncDeltaResponse } from "@kwakopos2/contracts";
import { orderSyncOperations } from "../../packages/sync/src/syncIntegrity";

export interface OutboxItem {
  id: string;
  entityType: "Product" | "ProductVariant" | "StockAdjustment" | "StockLedger" | "ProductPriceHistory" | "Sale" | "Customer" | "Supplier" | "PurchaseOrder" | "PurchaseReceipt" | "Payment" | "User" | "Receipt";
  entityId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  idempotencyKey: string;
  status: "PENDING" | "SYNCED" | "FAILED";
}

type NativeStore = "products" | "productVariants" | "stockLedger" | "stockAdjustments" | "stockBalance" | "productPriceHistory" | "receipts" | "customers" | "suppliers" | "syncOutbox" | "syncMetadata";
const STORE_NAMES: NativeStore[] = ["products", "productVariants", "stockLedger", "stockAdjustments", "stockBalance", "productPriceHistory", "receipts", "customers", "suppliers", "syncOutbox", "syncMetadata"];
const DB_NAME = "kwakopos-v2";
const DEFAULT_SCHEMA_VERSION = 2;

export class LocalIndexedDbStore {
  schemaVersion: number;
  products = new Map<string, Product>();
  productVariants = new Map<string, ProductVariant>();
  stockLedger = new Map<string, StockLedger>();
  stockAdjustments = new Map<string, StockAdjustment>();
  stockBalance = new Map<string, ProductBranchStock>();
  productPriceHistory = new Map<string, ProductPriceHistory>();
  receipts = new Map<string, any>();
  customers = new Map<string, any>();
  suppliers = new Map<string, any>();
  syncOutbox = new Map<string, OutboxItem>();
  syncMetadata = new Map<string, string>();
  readonly ready: Promise<void>;
  private nativeDb: IDBDatabase | null = null;
  private persistenceTail: Promise<void> = Promise.resolve();
  private persistenceError: unknown = null;

  constructor(requestedSchemaVersion = DEFAULT_SCHEMA_VERSION) {
    this.schemaVersion = Number.isInteger(requestedSchemaVersion) && requestedSchemaVersion > 0 ? requestedSchemaVersion : DEFAULT_SCHEMA_VERSION;
    this.ready = this.initializeNativePersistence();
  }

  private async initializeNativePersistence(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const currentVersion = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => { const db = request.result; const version = db.version; db.close(); resolve(version); };
      request.onerror = () => reject(request.error || new Error("IndexedDB version probe failed"));
    });
    const openVersion = Math.max(currentVersion, this.schemaVersion);
    this.schemaVersion = openVersion;
    this.nativeDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, openVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORE_NAMES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another open connection"));
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
      case "customers": return this.customers;
      case "suppliers": return this.suppliers;
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
    this.persistenceTail = this.persistenceTail.catch(() => undefined).then(() => new Promise<void>((resolve, reject) => {
      try {
        const tx = this.nativeDb!.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB write failed: ${store}`));
        tx.onabort = () => reject(tx.error || new Error(`IndexedDB write aborted: ${store}`));
      } catch (error) { reject(error); }
    })).catch((error) => { this.persistenceError = error; throw error; });
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceTail;
    if (this.persistenceError) throw this.persistenceError instanceof Error ? this.persistenceError : new Error(String(this.persistenceError));
  }

  clear(): void {
    this.products.clear(); this.productVariants.clear(); this.stockLedger.clear(); this.stockAdjustments.clear(); this.stockBalance.clear(); this.productPriceHistory.clear(); this.receipts.clear(); this.customers.clear(); this.suppliers.clear(); this.syncOutbox.clear(); this.syncMetadata.clear(); this.persistenceError = null;
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
  saveCustomerLocal(customer: any): void { this.customers.set(customer.id, customer); this.persist("customers", customer.id, customer); }
  saveSupplierLocal(supplier: any): void { this.suppliers.set(supplier.id, supplier); this.persist("suppliers", supplier.id, supplier); }
  recordOutboxMutation(item: OutboxItem): void { this.syncOutbox.set(item.id, item); this.persist("syncOutbox", item.id, item); }

  private pendingFor(entityType: string, entityId: string): OutboxItem | null {
    for (const item of this.syncOutbox.values()) {
      if (item.status === "PENDING" && item.entityType === entityType && item.entityId === entityId) return item;
    }
    return null;
  }

  private protectServerRecord(entityType: string, entityId: string): boolean {
    const pending = this.pendingFor(entityType, entityId);
    if (!pending || !["UPDATE", "DELETE"].includes(pending.operationType)) return false;
    this.setSyncMetadata(`sync_conflict_${entityType}_${entityId}`, JSON.stringify({ entityType, entityId, operationId: pending.id, clientCreatedAt: pending.clientCreatedAt }));
    return true;
  }

  async applyServerDelta(delta: SyncDeltaResponse): Promise<number> {
    await this.ready;
    const serverTime = Date.parse(delta.serverTimestamp);
    if (!Number.isFinite(serverTime)) throw new Error("SYNC_PROTOCOL_INVALID: invalid server timestamp");
    const priorCursor = this.syncMetadata.get("lastSyncTime");
    if (priorCursor && serverTime < Date.parse(priorCursor)) throw new Error("SYNC_PROTOCOL_INVALID: server timestamp moved backwards");
    const products = Array.isArray(delta.products) ? delta.products : [];
    const variants = Array.isArray(delta.variants) ? delta.variants : [];
    const ledger = Array.isArray(delta.stockLedger) ? delta.stockLedger : [];
    const adjustments = Array.isArray(delta.adjustments) ? delta.adjustments : [];
    const customers = Array.isArray(delta.customers) ? delta.customers : [];
    const suppliers = Array.isArray(delta.suppliers) ? delta.suppliers : [];
    let appliedCount = 0;

    if (!this.nativeDb) {
      for (const product of products) {
        if (this.protectServerRecord("Product", product.id) || (product.variants || []).some((v) => this.protectServerRecord("ProductVariant", v.id))) continue;
        this.saveProductLocal(product); appliedCount += 1;
      }
      for (const variant of variants) { if (this.protectServerRecord("ProductVariant", variant.id)) continue; this.saveVariantLocal(variant); appliedCount += 1; }
      for (const entry of ledger) { this.saveStockLedgerLocal(entry); appliedCount += 1; }
      for (const adjustment of adjustments) { if (this.protectServerRecord("StockAdjustment", adjustment.id)) continue; this.saveStockAdjustmentLocal(adjustment); appliedCount += 1; }
      for (const customer of customers) { if (this.protectServerRecord("Customer", customer.id)) continue; this.saveCustomerLocal(customer); appliedCount += 1; }
      for (const supplier of suppliers) { if (this.protectServerRecord("Supplier", supplier.id)) continue; this.saveSupplierLocal(supplier); appliedCount += 1; }
      await this.flushPersistence();
      this.setSyncMetadata("lastSyncTime", delta.serverTimestamp);
      await this.flushPersistence();
      return appliedCount;
    }

    const tx = this.nativeDb.transaction(["products", "productVariants", "stockLedger", "stockAdjustments", "customers", "suppliers", "syncMetadata"], "readwrite");
    const productsStore = tx.objectStore("products");
    const variantsStore = tx.objectStore("productVariants");
    const ledgerStore = tx.objectStore("stockLedger");
    const adjustmentsStore = tx.objectStore("stockAdjustments");
    const customersStore = tx.objectStore("customers");
    const suppliersStore = tx.objectStore("suppliers");

    for (const product of products) {
      if (this.protectServerRecord("Product", product.id) || (product.variants || []).some((v) => this.pendingFor("ProductVariant", v.id))) continue;
      productsStore.put(product, product.id); this.products.set(product.id, product); appliedCount += 1;
      for (const variant of product.variants || []) { if (this.protectServerRecord("ProductVariant", variant.id)) continue; variantsStore.put(variant, variant.id); this.productVariants.set(variant.id, variant); appliedCount += 1; }
    }
    for (const variant of variants) { if (this.protectServerRecord("ProductVariant", variant.id)) continue; variantsStore.put(variant, variant.id); this.productVariants.set(variant.id, variant); appliedCount += 1; }
    for (const entry of ledger) { ledgerStore.put(entry, entry.id); this.stockLedger.set(entry.id, entry); appliedCount += 1; }
    for (const adjustment of adjustments) { if (this.protectServerRecord("StockAdjustment", adjustment.id)) continue; adjustmentsStore.put(adjustment, adjustment.id); this.stockAdjustments.set(adjustment.id, adjustment); appliedCount += 1; }
    for (const customer of customers) { if (this.protectServerRecord("Customer", customer.id)) continue; customersStore.put(customer, customer.id); this.customers.set(customer.id, customer); appliedCount += 1; }
    for (const supplier of suppliers) { if (this.protectServerRecord("Supplier", supplier.id)) continue; suppliersStore.put(supplier, supplier.id); this.suppliers.set(supplier.id, supplier); appliedCount += 1; }
    tx.objectStore("syncMetadata").put(delta.serverTimestamp, "lastSyncTime");

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB sync transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB sync transaction aborted"));
    });
    this.syncMetadata.set("lastSyncTime", delta.serverTimestamp);
    return appliedCount;
  }

  private localUpdatedAt(entityType: string, entityId: string): string | null {
    const row = entityType === "Product" ? this.products.get(entityId) : entityType === "ProductVariant" ? this.productVariants.get(entityId) : entityType === "Customer" ? this.customers.get(entityId) : entityType === "Supplier" ? this.suppliers.get(entityId) : null;
    const value = row?.updatedAt;
    return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : null;
  }

  enqueueOutbox(item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>): OutboxItem {
    const opId = item.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `OP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
    const operationType = item.operationType || "CREATE";
    const sourcePayload = item.payload || item.data || {};
    const payload = (operationType === "UPDATE" || operationType === "DELETE") && !sourcePayload._baseUpdatedAt
      ? { ...sourcePayload, _baseUpdatedAt: this.localUpdatedAt(entityType, item.entityId || opId) }
      : sourcePayload;
    const outboxItem: OutboxItem = { id: opId, entityType, entityId: item.entityId || opId, operationType, payload, clientCreatedAt: item.clientCreatedAt || new Date().toISOString(), idempotencyKey: item.idempotencyKey || opId, status: "PENDING" };
    this.recordOutboxMutation(outboxItem);
    return outboxItem;
  }

  getPendingOutbox(): OutboxItem[] {
    return orderSyncOperations([...this.syncOutbox.values()].filter((item) => item.status === "PENDING") as any) as unknown as OutboxItem[];
  }
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
    this.persistenceTail = this.persistenceTail.catch(() => undefined).then(() => new Promise<void>((resolve, reject) => {
      try {
        const tx = this.nativeDb!.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(`IndexedDB delete failed: ${store}`));
        tx.onabort = () => reject(tx.error || new Error(`IndexedDB delete aborted: ${store}`));
      } catch (error) { reject(error); }
    })).catch((error) => { this.persistenceError = error; throw error; });
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
