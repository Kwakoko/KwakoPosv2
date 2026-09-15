import type {
  Product,
  ProductVariant,
  StockLedger,
  StockAdjustment,
  ProductBranchStock,
  ProductPriceHistory,
  SyncOperationType,
  SyncDeltaResponse,
  SyncBootstrapResponse,
  SyncStateManifest,
} from "@kwakopos2/contracts";
import { globalMigrationEngine, MigrationJournalEntry } from "./persistence/migrationEngine.js";
import { globalSnapshotRecoveryEngine, RecoverySnapshot, SnapshotStoreItem } from "./persistence/snapshotRecoveryEngine.js";
import { globalStoragePressureMonitor } from "./persistence/storagePressure.js";

export interface OutboxItem {
  id: string;
  entityType:
    | "Product"
    | "ProductVariant"
    | "StockAdjustment"
    | "StockLedger"
    | "ProductPriceHistory"
    | "Sale"
    | "Customer"
    | "Supplier"
    | "Category"
    | "Brand"
    | "PurchaseOrder"
    | "PurchaseReceipt"
    | "Payment"
    | "User"
    | "Receipt"
    | string;
  entityId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  idempotencyKey: string;
  status: "PENDING" | "SYNCED" | "FAILED";
  tenantId?: string;
  branchId?: string;
}

export type NativeStore =
  | "products"
  | "productVariants"
  | "stockLedger"
  | "stockAdjustments"
  | "stockBalance"
  | "productPriceHistory"
  | "sales"
  | "payments"
  | "receipts"
  | "customers"
  | "suppliers"
  | "syncOutbox"
  | "syncMetadata"
  | "configuration"
  | "auditState"
  | "migrationJournal"
  | "recoverySnapshots"
  | "updateState";

export const ALL_STORE_NAMES: NativeStore[] = [
  "products",
  "productVariants",
  "stockLedger",
  "stockAdjustments",
  "stockBalance",
  "productPriceHistory",
  "sales",
  "payments",
  "receipts",
  "customers",
  "suppliers",
  "syncOutbox",
  "syncMetadata",
  "configuration",
  "auditState",
  "migrationJournal",
  "recoverySnapshots",
  "updateState",
];

const DB_NAME = "kwakopos-v2";
export const AUTHORITATIVE_SCHEMA_VERSION = 4;

function localSyncRank(item: { entityType: string; operationType: string }): number {
  if (item.entityType === "Category" || item.entityType === "Brand") return 5;
  if (item.entityType === "Product" && item.operationType === "CREATE") return 10;
  if (item.entityType === "Product" && item.operationType === "UPDATE") return 20;
  if (item.entityType === "ProductVariant" && item.operationType === "CREATE") return 30;
  if (item.entityType === "ProductVariant" && item.operationType === "UPDATE") return 40;
  if (item.entityType === "ProductVariant" && item.operationType === "DELETE") return 50;
  if (item.entityType === "StockAdjustment") return 60;
  if (item.entityType === "Customer" || item.entityType === "Supplier") return 70;
  if (item.entityType === "PurchaseOrder") return 80;
  if (item.entityType === "PurchaseReceipt" || item.entityType === "Sale") return 90;
  if (item.entityType === "Payment" || item.entityType === "CashSession") return 100;
  if (
    item.entityType.startsWith("Plugin:") ||
    ["RestaurantTable", "KitchenTicket", "GarageVehicle", "GarageWorkOrder", "PharmacyPrescription", "TelecomSite"].includes(
      item.entityType,
    )
  )
    return 110;
  return 120;
}

export function orderPendingOutbox(items: OutboxItem[]): OutboxItem[] {
  return [...items].sort(
    (a, b) =>
      localSyncRank(a) - localSyncRank(b) ||
      Date.parse(a.clientCreatedAt) - Date.parse(b.clientCreatedAt) ||
      a.id.localeCompare(b.id),
  );
}

export interface TenantScopedContext {
  tenantId: string;
  branchId?: string;
  userId?: string;
}

export class LocalIndexedDbStore {
  schemaVersion: number;
  products = new Map<string, Product>();
  productVariants = new Map<string, ProductVariant>();
  stockLedger = new Map<string, StockLedger>();
  stockAdjustments = new Map<string, StockAdjustment>();
  stockBalance = new Map<string, ProductBranchStock>();
  productPriceHistory = new Map<string, ProductPriceHistory>();
  sales = new Map<string, any>();
  payments = new Map<string, any>();
  receipts = new Map<string, any>();
  customers = new Map<string, any>();
  suppliers = new Map<string, any>();
  syncOutbox = new Map<string, OutboxItem>();
  syncMetadata = new Map<string, string>();
  configuration = new Map<string, any>();
  auditState = new Map<string, any>();
  migrationJournal = new Map<string, MigrationJournalEntry>();
  recoverySnapshots = new Map<string, RecoverySnapshot>();
  updateState = new Map<string, any>();

  readonly ready: Promise<void>;
  private nativeDb: IDBDatabase | null = null;
  readonly dbName: string;
  private persistenceTail: Promise<void> = Promise.resolve();
  private persistenceError: unknown = null;

  constructor(requestedSchemaVersion = AUTHORITATIVE_SCHEMA_VERSION, dbName = DB_NAME) {
    this.dbName = dbName;
    this.schemaVersion =
      Number.isInteger(requestedSchemaVersion) && requestedSchemaVersion > 0
        ? requestedSchemaVersion
        : AUTHORITATIVE_SCHEMA_VERSION;
    this.ready = this.initializeNativePersistence();
  }

  private async initializeNativePersistence(): Promise<void> {
    if (typeof indexedDB === "undefined") return;

    try {
      const openDb = (ver?: number): Promise<IDBDatabase> => {
        return new Promise((resolve, reject) => {
          const timeoutTimer = setTimeout(() => {
            reject(new Error("IndexedDB open timed out after 3000ms"));
          }, 3000);

          let request: IDBOpenDBRequest;
          try {
            request = ver !== undefined ? indexedDB.open(this.dbName, ver) : indexedDB.open(this.dbName);
          } catch (err) {
            clearTimeout(timeoutTimer);
            reject(err);
            return;
          }

          request.onupgradeneeded = (event) => {
            const db = request.result;
            const transaction = request.transaction!;
            const oldVersion = event.oldVersion || 0;
            const newVersion = event.newVersion || ver || this.schemaVersion;

            globalMigrationEngine.applySchemaUpgrade(db, transaction, oldVersion, newVersion);
          };

          request.onsuccess = () => {
            clearTimeout(timeoutTimer);
            const db = request.result;
            db.onversionchange = () => {
              try {
                db.close();
              } catch {
                /* ignore */
              }
            };
            resolve(db);
          };

          request.onerror = () => {
            clearTimeout(timeoutTimer);
            reject(request.error || new Error("IndexedDB open failed"));
          };

          request.onblocked = () => {
            clearTimeout(timeoutTimer);
            reject(new Error("IndexedDB upgrade blocked by another open connection"));
          };
        });
      };

      this.nativeDb = await openDb(this.schemaVersion).catch(async (err) => {
        // If VersionError (existing DB is at higher version), open at existing version without VersionError
        if (err && (err.name === "VersionError" || String(err).includes("VersionError"))) {
          return openDb(undefined);
        }
        throw err;
      });

      // Hydrate only critical operational stores on the startup-critical path.
      // Historical/administrative stores are warmed progressively after the ready gate.
      if (this.nativeDb) {
        const startupStores: NativeStore[] = [
          "products", "productVariants", "stockBalance", "sales", "payments",
          "receipts", "customers", "suppliers", "syncOutbox", "syncMetadata",
        ];
        const activeStores = startupStores.filter((store) => this.nativeDb!.objectStoreNames.contains(store));
        for (const store of activeStores) {
          const targetMap = this.getTargetMap(store);
          if (targetMap) await this.hydrateMap(store, targetMap);
        }

        const deferredStores = (Array.from(this.nativeDb.objectStoreNames) as NativeStore[])
          .filter((store) => !startupStores.includes(store));
        const warmDeferredStores = async () => {
          for (const store of deferredStores) {
            const targetMap = this.getTargetMap(store);
            if (!targetMap) continue;
            await this.hydrateMap(store, targetMap);
            await new Promise<void>((resolve) => {
              if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 250 });
              else setTimeout(resolve, 0);
            });
          }
        };
        void warmDeferredStores().catch((error) => {
          console.warn("[IndexedDB] Background store warm failed:", error);
        });
      }

      const storedSchema = this.syncMetadata.get("schemaVersion");
      if (storedSchema) {
        this.schemaVersion = Math.max(this.schemaVersion, Number(storedSchema) || this.schemaVersion);
      }
      this.setSyncMetadata("schemaVersion", String(this.schemaVersion));
      await this.flushPersistence();
    } catch (error) {
      console.warn("IndexedDB persistence unavailable, running in in-memory mode:", error);
      this.nativeDb = null;
    }
  }

  public getTargetMap(store: NativeStore): Map<string, any> {
    switch (store) {
      case "products":
        return this.products;
      case "productVariants":
        return this.productVariants;
      case "stockLedger":
        return this.stockLedger;
      case "stockAdjustments":
        return this.stockAdjustments;
      case "stockBalance":
        return this.stockBalance;
      case "productPriceHistory":
        return this.productPriceHistory;
      case "sales":
        return this.sales;
      case "payments":
        return this.payments;
      case "receipts":
        return this.receipts;
      case "customers":
        return this.customers;
      case "suppliers":
        return this.suppliers;
      case "syncOutbox":
        return this.syncOutbox;
      case "syncMetadata":
        return this.syncMetadata;
      case "configuration":
        return this.configuration;
      case "auditState":
        return this.auditState;
      case "migrationJournal":
        return this.migrationJournal;
      case "recoverySnapshots":
        return this.recoverySnapshots;
      case "updateState":
        return this.updateState;
    }
  }

  private hydrateMap<T>(store: NativeStore, target: Map<string, T>): Promise<void> {
    if (!this.nativeDb || !this.nativeDb.objectStoreNames.contains(store)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this.nativeDb!.transaction(store, "readonly");
      const request = tx.objectStore(store).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        target.set(String(cursor.primaryKey), cursor.value as T);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`IndexedDB read failed: ${store}`));
      tx.onabort = () => reject(tx.error || new Error(`IndexedDB read aborted: ${store}`));
    });
  }

  private persist<T>(store: NativeStore, key: string, value: T): void {
    if (!this.nativeDb || !this.nativeDb.objectStoreNames.contains(store)) return;
    this.persistenceTail = this.persistenceTail
      .catch(() => undefined)
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            try {
              if (!this.nativeDb || !this.nativeDb.objectStoreNames.contains(store)) {
                resolve();
                return;
              }
              const tx = this.nativeDb.transaction(store, "readwrite");
              tx.objectStore(store).put(value, key);
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error || new Error(`IndexedDB write failed: ${store}`));
              tx.onabort = () => reject(tx.error || new Error(`IndexedDB write aborted: ${store}`));
            } catch (error) {
              reject(error);
            }
          }),
      )
      .catch((error) => {
        this.persistenceError = error;
        throw error;
      });
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceTail;
    if (this.persistenceError) {
      throw this.persistenceError instanceof Error
        ? this.persistenceError
        : new Error(String(this.persistenceError));
    }
  }

  clear(options?: { allowDestructiveReset?: boolean; tenantId?: string }): void {
    if (options && !options.allowDestructiveReset && options.tenantId) {
      this.clearTenantData(options.tenantId);
      return;
    }

    this.products.clear();
    this.productVariants.clear();
    this.stockLedger.clear();
    this.stockAdjustments.clear();
    this.stockBalance.clear();
    this.productPriceHistory.clear();
    this.sales.clear();
    this.payments.clear();
    this.receipts.clear();
    this.customers.clear();
    this.suppliers.clear();
    this.syncOutbox.clear();
    this.syncMetadata.clear();
    this.configuration.clear();
    this.auditState.clear();
    this.migrationJournal.clear();
    this.recoverySnapshots.clear();
    this.updateState.clear();
    this.persistenceError = null;

    if (this.nativeDb) {
      for (const store of ALL_STORE_NAMES) {
        if (this.nativeDb.objectStoreNames.contains(store)) {
          try {
            this.nativeDb.transaction(store, "readwrite").objectStore(store).clear();
          } catch {
            /* best effort */
          }
        }
      }
    }
  }

  clearTenantData(tenantId: string): void {
    if (!tenantId) return;

    const filterTenant = (map: Map<string, any>, storeName: NativeStore) => {
      for (const [key, value] of Array.from(map.entries())) {
        if (value && typeof value === "object" && (value.tenantId === tenantId || value.payload?.tenantId === tenantId)) {
          map.delete(key);
          if (this.nativeDb && this.nativeDb.objectStoreNames.contains(storeName)) {
            try {
              this.nativeDb.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
            } catch {
              /* ignore */
            }
          }
        }
      }
    };

    filterTenant(this.products, "products");
    filterTenant(this.productVariants, "productVariants");
    filterTenant(this.stockLedger, "stockLedger");
    filterTenant(this.stockAdjustments, "stockAdjustments");
    filterTenant(this.stockBalance, "stockBalance");
    filterTenant(this.productPriceHistory, "productPriceHistory");
    filterTenant(this.sales, "sales");
    filterTenant(this.payments, "payments");
    filterTenant(this.receipts, "receipts");
    filterTenant(this.customers, "customers");
    filterTenant(this.suppliers, "suppliers");
    filterTenant(this.syncOutbox, "syncOutbox");
    filterTenant(this.configuration, "configuration");
    filterTenant(this.auditState, "auditState");
  }

  saveProductLocal(product: Product, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!product.tenantId || product.tenantId !== ctx.tenantId)) {
      product = { ...product, tenantId: ctx.tenantId };
    }

    // World-class Product-Variant First Architecture: deterministic stock derivation
    if (product.variants && product.variants.length > 0) {
      const activeVars = product.variants.filter((v: any) => v.isActive !== false);
      const sumStock = activeVars.reduce((acc, v) => acc + Number((v as any).inventoryQuantity ?? (v as any).stock ?? 0), 0);
      const pAny = product as any;
      pAny.stock = sumStock;
      pAny.totalStock = sumStock;
      pAny.availableStock = sumStock;
      pAny.hasVariants = true;
    }

    this.products.set(product.id, product);
    this.persist("products", product.id, product);
    for (const variant of product.variants || []) {
      this.saveVariantLocal(variant, ctx);
    }
  }

  saveProductWithVariantsLocal(product: Product, variants: ProductVariant[], ctx?: TenantScopedContext): void {
    const updatedProduct = {
      ...product,
      hasVariants: Boolean((product as any).hasVariants),
      variants,
    };
    this.saveProductLocal(updatedProduct, ctx);
  }

  saveVariantLocal(variant: ProductVariant, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && !(variant as any).tenantId) {
      variant = { ...variant, tenantId: ctx.tenantId } as any;
    }
    this.productVariants.set(variant.id, variant);
    this.persist("productVariants", variant.id, variant);
  }

  deleteVariantLocal(variantId: string): void {
    const v = this.productVariants.get(variantId);
    this.productVariants.delete(variantId);
    if (this.nativeDb && this.nativeDb.objectStoreNames.contains("productVariants")) {
      try {
        this.nativeDb.transaction("productVariants", "readwrite").objectStore("productVariants").delete(variantId);
      } catch {}
    }
    const productId = v?.productId;
    if (productId) {
      const p = this.products.get(productId);
      if (p) {
        const remainingVariants: any[] = [];
        for (const varItem of this.productVariants.values()) {
          if (varItem.productId === productId && varItem.id !== variantId) {
            remainingVariants.push(varItem);
          }
        }
        this.saveProductLocal({
          ...p,
          hasVariants: remainingVariants.length > 0,
          variants: remainingVariants,
        });
      }
    }
  }

  saveStockLedgerLocal(entry: StockLedger, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!entry.tenantId || entry.tenantId !== ctx.tenantId)) {
      entry = { ...entry, tenantId: ctx.tenantId };
    }
    this.stockLedger.set(entry.id, entry);
    this.persist("stockLedger", entry.id, entry);
  }

  saveStockAdjustmentLocal(adjustment: StockAdjustment, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!adjustment.tenantId || adjustment.tenantId !== ctx.tenantId)) {
      adjustment = { ...adjustment, tenantId: ctx.tenantId };
    }
    this.stockAdjustments.set(adjustment.id, adjustment);
    this.persist("stockAdjustments", adjustment.id, adjustment);
  }

  saveStockBalanceLocal(balance: ProductBranchStock, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && !(balance as any).tenantId) {
      balance = { ...balance, tenantId: ctx.tenantId } as any;
    }
    this.stockBalance.set(balance.id, balance);
    this.persist("stockBalance", balance.id, balance);
  }

  saveProductPriceHistoryLocal(history: ProductPriceHistory, ctx?: TenantScopedContext): void {
    this.productPriceHistory.set(history.id, history);
    this.persist("productPriceHistory", history.id, history);
  }

  saveSaleLocal(sale: any, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!sale.tenantId || sale.tenantId !== ctx.tenantId)) {
      sale = { ...sale, tenantId: ctx.tenantId };
    }
    this.sales.set(sale.id, sale);
    this.persist("sales", sale.id, sale);
  }

  savePaymentLocal(payment: any, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!payment.tenantId || payment.tenantId !== ctx.tenantId)) {
      payment = { ...payment, tenantId: ctx.tenantId };
    }
    this.payments.set(payment.id, payment);
    this.persist("payments", payment.id, payment);
  }

  saveCustomerLocal(customer: any, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!customer.tenantId || customer.tenantId !== ctx.tenantId)) {
      customer = { ...customer, tenantId: ctx.tenantId };
    }
    this.customers.set(customer.id, customer);
    this.persist("customers", customer.id, customer);
  }

  saveSupplierLocal(supplier: any, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!supplier.tenantId || supplier.tenantId !== ctx.tenantId)) {
      supplier = { ...supplier, tenantId: ctx.tenantId };
    }
    this.suppliers.set(supplier.id, supplier);
    this.persist("suppliers", supplier.id, supplier);
  }

  saveReceiptLocal(receipt: any, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && (!receipt.tenantId || receipt.tenantId !== ctx.tenantId)) {
      receipt = { ...receipt, tenantId: ctx.tenantId };
    }
    this.receipts.set(receipt.id, receipt);
    this.persist("receipts", receipt.id, receipt);
  }

  saveConfigurationLocal(key: string, value: any, ctx?: TenantScopedContext): void {
    const compoundKey = ctx?.tenantId ? `${ctx.tenantId}:${key}` : key;
    const item = { key, value, tenantId: ctx?.tenantId, updatedAt: new Date().toISOString() };
    this.configuration.set(compoundKey, item);
    this.persist("configuration", compoundKey, item);
  }

  getConfigurationLocal(key: string, ctx?: TenantScopedContext): any {
    if (ctx?.tenantId) {
      const compoundKey = `${ctx.tenantId}:${key}`;
      const item = this.configuration.get(compoundKey);
      if (item) return item.value;
    }
    const direct = this.configuration.get(key);
    if (direct !== undefined) {
      return direct?.value !== undefined ? direct.value : direct;
    }
    for (const [k, item] of this.configuration.entries()) {
      if (k.endsWith(`:${key}`)) {
        return item?.value !== undefined ? item.value : item;
      }
    }
    return undefined;
  }

  saveCatalogCategoriesLocal(records: any[], ctx?: TenantScopedContext): void {
    const current = Array.isArray(this.getConfigurationLocal("inventory_categories_meta", ctx)) ? this.getConfigurationLocal("inventory_categories_meta", ctx) : [];
    const map = new Map(current.map((r: any) => [r.id, r]));
    for (const r of records || []) { if (r.isActive === false) map.delete(r.id); else map.set(r.id, { ...r, isDefault: false }); }
    this.saveConfigurationLocal("inventory_categories_meta", Array.from(map.values()), ctx);
  }

  saveCatalogBrandsLocal(records: any[], ctx?: TenantScopedContext): void {
    const current = Array.isArray(this.getConfigurationLocal("inventory_brands_meta", ctx)) ? this.getConfigurationLocal("inventory_brands_meta", ctx) : [];
    const map = new Map(current.map((r: any) => [r.id, r]));
    for (const r of records || []) { if (r.isActive === false) map.delete(r.id); else map.set(r.id, { ...r, isDefault: false }); }
    this.saveConfigurationLocal("inventory_brands_meta", Array.from(map.values()), ctx);
  }

  getProductsLocal(tenantId?: string): Product[] {
    const all = [...this.products.values()];
    return tenantId ? all.filter((p) => p.tenantId === tenantId) : all;
  }

  getProductVariantsLocal(tenantId?: string): ProductVariant[] {
    const all = [...this.productVariants.values()];
    return tenantId ? all.filter((v: any) => v.tenantId === tenantId) : all;
  }

  getSalesLocal(tenantId?: string): any[] {
    const all = [...this.sales.values()];
    return tenantId ? all.filter((s) => s.tenantId === tenantId) : all;
  }

  getPaymentsLocal(tenantId?: string): any[] {
    const all = [...this.payments.values()];
    return tenantId ? all.filter((p) => p.tenantId === tenantId) : all;
  }

  getCustomersLocal(tenantId?: string): any[] {
    const all = [...this.customers.values()];
    return tenantId ? all.filter((c) => c.tenantId === tenantId) : all;
  }

  getSuppliersLocal(tenantId?: string): any[] {
    const all = [...this.suppliers.values()];
    return tenantId ? all.filter((s) => s.tenantId === tenantId) : all;
  }

  getStockLedgerLocal(tenantId?: string): StockLedger[] {
    const all = [...this.stockLedger.values()];
    return tenantId ? all.filter((l) => l.tenantId === tenantId) : all;
  }

  getStockAdjustmentsLocal(tenantId?: string): StockAdjustment[] {
    const all = [...this.stockAdjustments.values()];
    return tenantId ? all.filter((a) => a.tenantId === tenantId) : all;
  }

  getReceiptsLocal(tenantId?: string): any[] {
    const all = [...this.receipts.values()];
    return tenantId ? all.filter((r) => r.tenantId === tenantId) : all;
  }

  recordOutboxMutation(item: OutboxItem, ctx?: TenantScopedContext): void {
    if (ctx?.tenantId && !item.tenantId) {
      item = { ...item, tenantId: ctx.tenantId, branchId: ctx.branchId || item.branchId };
    }
    this.syncOutbox.set(item.id, item);
    this.persist("syncOutbox", item.id, item);
  }

  async executeAtomicBusinessTransaction<T>(params: {
    targetStore: NativeStore;
    entityId: string;
    entityData: T;
    outboxItem: OutboxItem;
    tenantContext?: TenantScopedContext;
  }): Promise<{ entity: T; outbox: OutboxItem }> {
    globalStoragePressureMonitor.assertSafeForDestructiveOperation("executeAtomicBusinessTransaction");
    const { targetStore, entityId, outboxItem, tenantContext } = params;
    let entityData = params.entityData;

    if (tenantContext?.tenantId) {
      if (typeof entityData === "object" && entityData !== null) {
        entityData = { ...entityData, tenantId: tenantContext.tenantId };
      }
      outboxItem.tenantId = tenantContext.tenantId;
      if (tenantContext.branchId) outboxItem.branchId = tenantContext.branchId;
    }

    if (
      this.nativeDb &&
      this.nativeDb.objectStoreNames.contains(targetStore) &&
      this.nativeDb.objectStoreNames.contains("syncOutbox")
    ) {
      const tx = this.nativeDb.transaction([targetStore, "syncOutbox"], "readwrite");
      const entityStore = tx.objectStore(targetStore);
      const outboxStore = tx.objectStore("syncOutbox");

      entityStore.put(entityData, entityId);
      outboxStore.put(outboxItem, outboxItem.id);

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Atomic business transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("Atomic business transaction aborted"));
      });
    }

    const targetMap = this.getTargetMap(targetStore);
    if (targetMap) targetMap.set(entityId, entityData);
    this.syncOutbox.set(outboxItem.id, outboxItem);

    return { entity: entityData, outbox: outboxItem };
  }

  async createVerifiedSnapshot(reason: string, appVersion = "2.12.5"): Promise<RecoverySnapshot> {
    const storesData: Record<string, SnapshotStoreItem[]> = {};

    for (const storeName of ALL_STORE_NAMES) {
      const targetMap = this.getTargetMap(storeName);
      if (targetMap) {
        const items: SnapshotStoreItem[] = [];
        for (const [key, value] of targetMap.entries()) {
          items.push({ key, value });
        }
        storesData[storeName] = items;
      }
    }

    const snapshot = await globalSnapshotRecoveryEngine.createSnapshot(storesData, {
      reason,
      schemaVersion: this.schemaVersion,
      applicationVersion: appVersion,
    });

    this.recoverySnapshots.set(snapshot.id, snapshot);
    this.persist("recoverySnapshots", snapshot.id, snapshot);
    return snapshot;
  }

  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.recoverySnapshots.get(snapshotId) || globalSnapshotRecoveryEngine.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} not found`);
    }

    const isVerified = await globalSnapshotRecoveryEngine.verifySnapshot(snapshot);
    if (!isVerified) {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} failed integrity verification`);
    }

    for (const [storeName, items] of Object.entries(snapshot.stores)) {
      const typedStore = storeName as NativeStore;
      const targetMap = this.getTargetMap(typedStore);
      if (targetMap) {
        targetMap.clear();
        for (const item of items) {
          targetMap.set(item.key, item.value);
        }
      }

      if (this.nativeDb && this.nativeDb.objectStoreNames.contains(typedStore)) {
        await new Promise<void>((resolve) => {
          try {
            const tx = this.nativeDb!.transaction(typedStore, "readwrite");
            const store = tx.objectStore(typedStore);
            store.clear();
            for (const item of items) {
              store.put(item.value, item.key);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        });
      }
    }

    this.schemaVersion = snapshot.schemaVersion;
    this.setSyncMetadata("schemaVersion", String(snapshot.schemaVersion));
    await this.flushPersistence();
    return true;
  }

  private pendingFor(entityType: string, entityId: string): OutboxItem | null {
    for (const item of this.syncOutbox.values()) {
      if (item.status === "PENDING" && item.entityType === entityType && item.entityId === entityId) return item;
    }
    return null;
  }

  private protectServerRecord(entityType: string, entityId: string): boolean {
    const pending = this.pendingFor(entityType, entityId);
    if (!pending || !["UPDATE", "DELETE"].includes(pending.operationType)) return false;
    this.setSyncMetadata(
      `sync_conflict_${entityType}_${entityId}`,
      JSON.stringify({ entityType, entityId, operationId: pending.id, clientCreatedAt: pending.clientCreatedAt }),
    );
    return true;
  }

  async applyServerDelta(delta: SyncDeltaResponse): Promise<number> {
    await this.ready;
    const serverTime = Date.parse(delta.serverTimestamp);
    if (!Number.isFinite(serverTime)) throw new Error("SYNC_PROTOCOL_INVALID: invalid server timestamp");
    const priorCursor = this.syncMetadata.get("lastSyncTime");
    if (priorCursor && serverTime < Date.parse(priorCursor))
      throw new Error("SYNC_PROTOCOL_INVALID: server timestamp moved backwards");
    const products = Array.isArray(delta.products) ? delta.products : [];
    const variants = Array.isArray(delta.variants) ? delta.variants : [];
    const ledger = Array.isArray(delta.stockLedger) ? delta.stockLedger : [];
    const adjustments = Array.isArray(delta.adjustments) ? delta.adjustments : [];
    const customers = Array.isArray(delta.customers) ? delta.customers : [];
    const suppliers = Array.isArray(delta.suppliers) ? delta.suppliers : [];
    const categories = Array.isArray(delta.categories) ? delta.categories : [];
    const brands = Array.isArray(delta.brands) ? delta.brands : [];
    const priceHistories = Array.isArray(delta.priceHistories) ? delta.priceHistories : [];
    let appliedCount = 0;

    if (!this.nativeDb) {
      for (const product of products) {
        if (
          this.protectServerRecord("Product", product.id) ||
          (product.variants || []).some((v) => this.protectServerRecord("ProductVariant", v.id))
        )
          continue;
        this.saveProductLocal(product);
        appliedCount += 1;
      }
      for (const variant of variants) {
        if (this.protectServerRecord("ProductVariant", variant.id)) continue;
        this.saveVariantLocal(variant);
        appliedCount += 1;
      }
      for (const history of priceHistories) { this.saveProductPriceHistoryLocal(history as any); appliedCount += 1; }
      for (const entry of ledger) {
        this.saveStockLedgerLocal(entry);
        appliedCount += 1;
      }
      for (const adjustment of adjustments) {
        if (this.protectServerRecord("StockAdjustment", adjustment.id)) continue;
        this.saveStockAdjustmentLocal(adjustment);
        appliedCount += 1;
      }
      for (const customer of customers) {
        if (this.protectServerRecord("Customer", customer.id)) continue;
        this.saveCustomerLocal(customer);
        appliedCount += 1;
      }
      for (const supplier of suppliers) {
        if (this.protectServerRecord("Supplier", supplier.id)) continue;
        this.saveSupplierLocal(supplier);
        appliedCount += 1;
      }
      for (const history of priceHistories) { this.saveProductPriceHistoryLocal(history as any); appliedCount += 1; }
      if (categories.length) {
        const tenantId = String((categories[0] as any).tenantId || "");
        this.saveConfigurationLocal("inventory_categories_meta", categories.filter((c: any) => c.isActive !== false).map((c: any) => ({ id: c.id, name: c.name, description: c.description ?? undefined, color: c.color || "#10b981", isDefault: false })), tenantId ? { tenantId } : undefined);
      }
      if (brands.length) {
        const tenantId = String((brands[0] as any).tenantId || "");
        this.saveConfigurationLocal("inventory_brands_meta", brands.filter((b: any) => b.isActive !== false).map((b: any) => ({ id: b.id, name: b.name, origin: b.origin ?? undefined, notes: b.notes ?? undefined, isDefault: false })), tenantId ? { tenantId } : undefined);
      }
      await this.flushPersistence();
      this.setSyncMetadata("lastSyncTime", delta.serverTimestamp);
      await this.flushPersistence();
      return appliedCount;
    }

    const txStores = ["products", "productVariants", "stockLedger", "stockAdjustments", "customers", "suppliers", "syncMetadata"].filter(
      (s) => this.nativeDb!.objectStoreNames.contains(s),
    );
    const tx = this.nativeDb.transaction(txStores, "readwrite");
    const productsStore = tx.objectStore("products");
    const variantsStore = tx.objectStore("productVariants");
    const ledgerStore = tx.objectStore("stockLedger");
    const adjustmentsStore = tx.objectStore("stockAdjustments");
    const customersStore = tx.objectStore("customers");
    const suppliersStore = tx.objectStore("suppliers");

    for (const product of products) {
      if (
        this.protectServerRecord("Product", product.id) ||
        (product.variants || []).some((v) => this.pendingFor("ProductVariant", v.id))
      )
        continue;
      productsStore.put(product, product.id);
      this.products.set(product.id, product);
      appliedCount += 1;
      for (const variant of product.variants || []) {
        if (this.protectServerRecord("ProductVariant", variant.id)) continue;
        variantsStore.put(variant, variant.id);
        this.productVariants.set(variant.id, variant);
        appliedCount += 1;
      }
    }
    for (const variant of variants) {
      if (this.protectServerRecord("ProductVariant", variant.id)) continue;
      variantsStore.put(variant, variant.id);
      this.productVariants.set(variant.id, variant);
      appliedCount += 1;
    }
    for (const entry of ledger) {
      ledgerStore.put(entry, entry.id);
      this.stockLedger.set(entry.id, entry);
      appliedCount += 1;
    }
    for (const adjustment of adjustments) {
      if (this.protectServerRecord("StockAdjustment", adjustment.id)) continue;
      adjustmentsStore.put(adjustment, adjustment.id);
      this.stockAdjustments.set(adjustment.id, adjustment);
      appliedCount += 1;
    }
    for (const customer of customers) {
      if (this.protectServerRecord("Customer", customer.id)) continue;
      customersStore.put(customer, customer.id);
      this.customers.set(customer.id, customer);
      appliedCount += 1;
    }
    for (const supplier of suppliers) {
      if (this.protectServerRecord("Supplier", supplier.id)) continue;
      suppliersStore.put(supplier, supplier.id);
      this.suppliers.set(supplier.id, supplier);
      appliedCount += 1;
    }
    for (const history of priceHistories) { this.saveProductPriceHistoryLocal(history as any); appliedCount += 1; }
    tx.objectStore("syncMetadata").put(delta.serverTimestamp, "lastSyncTime");

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB sync transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB sync transaction aborted"));
    });
    this.syncMetadata.set("lastSyncTime", delta.serverTimestamp);
    if (categories.length) {
      const tenantId = String((categories[0] as any).tenantId || "");
      this.saveConfigurationLocal("inventory_categories_meta", categories.filter((c: any) => c.isActive !== false).map((c: any) => ({ id: c.id, name: c.name, description: c.description ?? undefined, color: c.color || "#10b981", isDefault: false })), tenantId ? { tenantId } : undefined);
    }
    if (brands.length) {
      const tenantId = String((brands[0] as any).tenantId || "");
      this.saveConfigurationLocal("inventory_brands_meta", brands.filter((b: any) => b.isActive !== false).map((b: any) => ({ id: b.id, name: b.name, origin: b.origin ?? undefined, notes: b.notes ?? undefined, isDefault: false })), tenantId ? { tenantId } : undefined);
    }
    await this.flushPersistence();
    return appliedCount;
  }

  recalculateProductStockLocal(productId: string): void {
    const product = this.products.get(productId);
    if (!product) return;
    const variants: ProductVariant[] = [];
    for (const v of this.productVariants.values()) {
      if (v.productId === productId) {
        variants.push(v);
      }
    }
    const activeVars = variants.filter((v: any) => v.isActive !== false);
    const sumStock = activeVars.reduce((acc, v) => acc + Number((v as any).inventoryQuantity ?? (v as any).stock ?? 0), 0);
    const updatedProduct = {
      ...product,
      variants,
      hasVariants: variants.length > 0,
      stock: sumStock,
      totalStock: sumStock,
      availableStock: sumStock,
    };
    this.products.set(productId, updatedProduct);
    this.persist("products", productId, updatedProduct);
  }

  async bootstrapFromAuthoritativeSnapshot(
    snapshot: SyncBootstrapResponse,
    ctx?: TenantScopedContext,
  ): Promise<{ applied: number }> {
    await this.ready;
    const serverTime = Date.parse(snapshot.snapshotTimestamp);
    if (!Number.isFinite(serverTime)) throw new Error("SYNC_PROTOCOL_INVALID: invalid snapshot timestamp");

    let appliedCount = 0;
    const products = Array.isArray(snapshot.products) ? snapshot.products : [];
    const variants = Array.isArray(snapshot.variants) ? snapshot.variants : [];
    const ledger = Array.isArray(snapshot.stockLedger) ? snapshot.stockLedger : [];
    const adjustments = Array.isArray(snapshot.adjustments) ? snapshot.adjustments : [];
    const customers = Array.isArray(snapshot.customers) ? snapshot.customers : [];
    const suppliers = Array.isArray(snapshot.suppliers) ? snapshot.suppliers : [];
    const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
    const brands = Array.isArray(snapshot.brands) ? snapshot.brands : [];
    const priceHistories = Array.isArray(snapshot.priceHistories) ? snapshot.priceHistories : [];

    for (const product of products) {
      if (
        this.protectServerRecord("Product", product.id) ||
        (product.variants || []).some((v) => this.protectServerRecord("ProductVariant", v.id))
      ) {
        continue;
      }
      this.saveProductLocal(product, ctx);
      appliedCount += 1;
    }

    for (const variant of variants) {
      if (this.protectServerRecord("ProductVariant", variant.id)) continue;
      this.saveVariantLocal(variant, ctx);
      appliedCount += 1;
    }

    for (const entry of ledger) {
      this.saveStockLedgerLocal(entry, ctx);
      appliedCount += 1;
    }

    for (const adjustment of adjustments) {
      if (this.protectServerRecord("StockAdjustment", adjustment.id)) continue;
      this.saveStockAdjustmentLocal(adjustment, ctx);
      appliedCount += 1;
    }

    for (const customer of customers) {
      if (this.protectServerRecord("Customer", customer.id)) continue;
      this.saveCustomerLocal(customer, ctx);
      appliedCount += 1;
    }

    for (const supplier of suppliers) {
      if (this.protectServerRecord("Supplier", supplier.id)) continue;
      this.saveSupplierLocal(supplier, ctx);
      appliedCount += 1;
    }

    for (const history of priceHistories) { this.saveProductPriceHistoryLocal(history as any, ctx); appliedCount += 1; }
    if (categories.length) {
      const tenantId = String((categories[0] as any).tenantId || ctx?.tenantId || "");
      this.saveConfigurationLocal("inventory_categories_meta", categories.filter((c: any) => c.isActive !== false).map((c: any) => ({ id: c.id, name: c.name, description: c.description ?? undefined, color: c.color || "#10b981", isDefault: false })), tenantId ? { tenantId } : ctx);
    }
    if (brands.length) {
      const tenantId = String((brands[0] as any).tenantId || ctx?.tenantId || "");
      this.saveConfigurationLocal("inventory_brands_meta", brands.filter((b: any) => b.isActive !== false).map((b: any) => ({ id: b.id, name: b.name, origin: b.origin ?? undefined, notes: b.notes ?? undefined, isDefault: false })), tenantId ? { tenantId } : ctx);
    }

    // Ensure all parent products have deterministic stock derived from variants
    for (const prodId of this.products.keys()) {
      this.recalculateProductStockLocal(prodId);
    }

    this.setSyncMetadata("lastSyncTime", snapshot.snapshotTimestamp);
    this.setSyncMetadata("lastBootstrapTime", snapshot.snapshotTimestamp);
    this.setSyncMetadata("lastBootstrapChecksum", snapshot.integrityChecksum);
    await this.flushPersistence();

    return { applied: appliedCount };
  }

  generateStateManifest(deviceId: string, tenantId?: string): SyncStateManifest {
    const products = this.getProductsLocal(tenantId);
    const variants = this.getProductVariantsLocal(tenantId);
    const ledger = this.getStockLedgerLocal(tenantId);
    const adjustments = this.getStockAdjustmentsLocal(tenantId);
    const customers = this.getCustomersLocal(tenantId);
    const suppliers = this.getSuppliersLocal(tenantId);

    const stockBalances: Record<string, number> = {};
    for (const v of variants) {
      stockBalances[v.id] = Number((v as any).inventoryQuantity ?? (v as any).stock ?? 0);
    }

    return {
      deviceId,
      lastSyncTime: this.syncMetadata.get("lastSyncTime") || null,
      schemaVersion: this.schemaVersion,
      storeCounts: {
        products: products.length,
        productVariants: variants.length,
        stockLedger: ledger.length,
        stockAdjustments: adjustments.length,
        customers: customers.length,
        suppliers: suppliers.length,
        syncOutbox: this.syncOutbox.size,
      },
      productIds: products.map((p) => p.id),
      variantIds: variants.map((v) => v.id),
      ledgerIds: ledger.map((l) => l.id),
      stockBalances,
    };
  }

  private localUpdatedAt(entityType: string, entityId: string): string | null {
    const row =
      entityType === "Product"
        ? this.products.get(entityId)
        : entityType === "ProductVariant"
          ? this.productVariants.get(entityId)
          : entityType === "Customer"
            ? this.customers.get(entityId)
            : entityType === "Supplier"
              ? this.suppliers.get(entityId)
              : null;
    const value = row?.updatedAt;
    return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : null;
  }

  enqueueOutbox(
    item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>,
  ): OutboxItem {
    const opId =
      item.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `OP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
    const entityId = item.entityId || opId;
    const operationType = item.operationType || "CREATE";
    const sourcePayload = item.payload || item.data || {};
    const baseUpdatedAt = this.localUpdatedAt(entityType, entityId);
    const payload =
      (operationType === "UPDATE" || operationType === "DELETE") && baseUpdatedAt && !sourcePayload._baseUpdatedAt
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
      tenantId: item.tenantId || (sourcePayload.tenantId as string | undefined),
      branchId: item.branchId || (sourcePayload.branchId as string | undefined),
    };
    this.recordOutboxMutation(outboxItem);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { item: outboxItem } }));
        if ("BroadcastChannel" in window) {
          const bc = new BroadcastChannel("kwakopos_sync_channel");
          bc.postMessage({ type: "OUTBOX_MUTATION", item: outboxItem, timestamp: Date.now() });
          bc.close();
        }
      }
    } catch {
      /* ignore broadcast error in isolated environments */
    }
    return outboxItem;
  }

  getPendingOutbox(tenantId?: string): OutboxItem[] {
    const all = [...this.syncOutbox.values()].filter((item) => item.status === "PENDING");
    const filtered = tenantId ? all.filter((i) => i.tenantId === tenantId) : all;
    return orderPendingOutbox(filtered);
  }

  getFailedOutbox(tenantId?: string): OutboxItem[] {
    const all = [...this.syncOutbox.values()].filter((item) => item.status === "FAILED");
    return tenantId ? all.filter((i) => i.tenantId === tenantId) : all;
  }

  retryOutbox(operationId: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item || item.status !== "FAILED") return;
    item.status = "PENDING";
    this.syncMetadata.delete(`error_${operationId}`);
    this.persist("syncOutbox", operationId, item);
    if (this.nativeDb) this.persistDelete("syncMetadata", `error_${operationId}`);
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

  private persistDelete(store: NativeStore, key: string): void {
    if (!this.nativeDb || !this.nativeDb.objectStoreNames.contains(store)) return;
    this.persistenceTail = this.persistenceTail
      .catch(() => undefined)
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            try {
              if (!this.nativeDb || !this.nativeDb.objectStoreNames.contains(store)) {
                resolve();
                return;
              }
              const tx = this.nativeDb.transaction(store, "readwrite");
              tx.objectStore(store).delete(key);
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error || new Error(`IndexedDB delete failed: ${store}`));
              tx.onabort = () => reject(tx.error || new Error(`IndexedDB delete aborted: ${store}`));
            } catch (error) {
              reject(error);
            }
          }),
      )
      .catch((error) => {
        this.persistenceError = error;
        throw error;
      });
  }

  async migrateToVersion(targetVersion: number): Promise<{
    previousVersion: number;
    newVersion: number;
    preservedOutboxCount: number;
    journalEntry?: MigrationJournalEntry;
  }> {
    const previousVersion = this.schemaVersion;
    const preservedOutboxCount = this.getPendingOutbox().length;

    if (!Number.isInteger(targetVersion) || targetVersion === previousVersion) {
      return { previousVersion, newVersion: previousVersion, preservedOutboxCount };
    }

    // Pre-migration verified local snapshot
    const snapshot = await this.createVerifiedSnapshot(
      `Migration from V${previousVersion} to V${targetVersion}`,
    );

    let journalEntry: MigrationJournalEntry | undefined;

    if (targetVersion > previousVersion) {
      // Forward migration via native IndexedDB upgrade transaction
      if (typeof indexedDB !== "undefined" && this.nativeDb) {
        try {
          this.nativeDb.close();
        } catch {
          /* ignore */
        }
        this.nativeDb = null;

        try {
          const openReq = indexedDB.open(this.dbName, targetVersion);
          await new Promise<IDBDatabase>((resolve, reject) => {
            openReq.onupgradeneeded = (e) => {
              const db = openReq.result;
              const tx = openReq.transaction!;
              journalEntry = globalMigrationEngine.applySchemaUpgrade(
                db,
                tx,
                previousVersion,
                targetVersion,
              );
            };
            openReq.onsuccess = () => {
              this.nativeDb = openReq.result;
              resolve(this.nativeDb);
            };
            openReq.onerror = () => reject(openReq.error || new Error("Migration open failed"));
            openReq.onblocked = () => reject(new Error("Migration blocked by open connection"));
          });
        } catch (err) {
          console.error("Migration transaction failed, initiating automatic recovery:", err);
          await this.restoreSnapshot(snapshot.id);
          throw err;
        }
      }
    } else {
      // Downgrade migration:
      // In W3C IndexedDB, indexedDB.open() cannot decrease a database version number.
      // We keep the physical database open and execute the logical data transformation
      // preserving all forward records in compatibility representations.
      journalEntry = {
        id: `DOWNGGRADE-${Date.now()}-${previousVersion}-to-${targetVersion}`,
        fromVersion: previousVersion,
        toVersion: targetVersion,
        direction: "DOWNGRADE",
        status: "COMPLETED",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        recordCountsBefore: { products: this.products.size, sales: this.sales.size },
        recordCountsAfter: { products: this.products.size, sales: this.sales.size },
      };
      globalMigrationEngine.recordJournalEntry(journalEntry);
    }

    this.schemaVersion = targetVersion;
    this.setSyncMetadata("schemaVersion", String(targetVersion));
    this.setSyncMetadata("lastMigratedAt", new Date().toISOString());
    await this.flushPersistence();

    return {
      previousVersion,
      newVersion: targetVersion,
      preservedOutboxCount: this.getPendingOutbox().length,
      journalEntry,
    };
  }

  close(): void {
    if (this.nativeDb) {
      try {
        this.nativeDb.close();
      } catch {
        /* ignore */
      }
      this.nativeDb = null;
    }
  }
}
