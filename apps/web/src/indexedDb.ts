import { AUTHORITATIVE_COMPATIBILITY_MATRIX } from "./persistence/releaseCompatibility.js";
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
import {
  type PersistenceState,
  type PersistenceStatusRecord,
  type PersistenceStatusSnapshot,
  createPersistenceStatus,
  emptyPersistenceStatusCounts,
  emitPersistenceStatusChanged,
  persistenceStatusKey,
  PERSISTENCE_STATUS_KEY_PREFIX,
} from "./persistence/persistenceStatus.js";

// Identity and HR records are privileged PostgreSQL authorities and never use the generic business sync outbox.
const SYNC_OUTBOX_FORBIDDEN_ENTITY_TYPES = new Set([
  "User",
  "Role",
  "Employee",
  "PlatformSecurity",
  "SuperAdmin",
]);

/** Maximum number of server rejections before an outbox item is permanently abandoned. */
export const MAX_OUTBOX_RETRIES = 5;

export function assertSyncOutboxEntityTypeAllowed(entityType: string): void {
  if (SYNC_OUTBOX_FORBIDDEN_ENTITY_TYPES.has(String(entityType))) {
    throw new Error(
      `PRIVILEGED_ENTITY_OUTBOX_FORBIDDEN: ${entityType} mutations must use the privileged PostgreSQL mutation service and may not enter syncOutbox.`
    );
  }
}

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
    | "Expense"
    | "User"
    | "Receipt"
    | string;
  entityId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  clientCreatedAt: string;
  idempotencyKey: string;
  status: "PENDING" | "SYNCED" | "FAILED" | "CONFLICT_RESOLVED";
  tenantId?: string;
  branchId?: string;
  error?: string;
  resolution?: string;
  /** Number of times this item has been attempted and rejected by the server. */
  retryCount?: number;
  /** ISO timestamp when this item was permanently abandoned (retryCount >= MAX_OUTBOX_RETRIES). */
  abandonedAt?: string;
}

export interface DrawerOutboxItem {
  id: string;
  operationId: string;
  saleId: string;
  paymentId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  status: "PENDING" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "TIMEOUT" | "UNKNOWN";
  attempts: number;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  payload: Record<string, unknown>;
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
  | "contacts"
  | "syncOutbox"
  | "traVfdOutbox"
  | "drawerOutbox"
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
  "contacts",
  "syncOutbox",
  "traVfdOutbox",
  "drawerOutbox",
  "syncMetadata",
  "configuration",
  "auditState",
  "migrationJournal",
  "recoverySnapshots",
  "updateState",
];

const DB_NAME = "kwakopos-v2";
export const AUTHORITATIVE_SCHEMA_VERSION = 7;
const PRE_V4_MIGRATION_SNAPSHOT_PREFIX = "__migration_snapshot_v4__:";

function localSyncRank(item: { entityType: string; operationType: string }): number {
  if (item.entityType === "Setting" || item.entityType === "FeatureFlag") return 1;
  if (item.entityType === "Category" || item.entityType === "Brand") return 5;
  if (item.entityType === "Product" && item.operationType === "CREATE") return 10;
  if (item.entityType === "Product" && item.operationType === "UPDATE") return 20;
  if (item.entityType === "ProductVariant" && item.operationType === "CREATE") return 30;
  if (item.entityType === "ProductVariant" && item.operationType === "UPDATE") return 40;
  if (item.entityType === "ProductVariant" && item.operationType === "DELETE") return 50;
  if (item.entityType === "StockAdjustment") return 60;
  if (item.entityType === "Customer" || item.entityType === "Supplier" || item.entityType === "CustomerContact") return 70;
  if (item.entityType === "PurchaseOrder") return 80;
  if (item.entityType === "PurchaseReceipt" || item.entityType === "Sale") return 90;
  if (item.entityType === "Expense") return 95;
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

export function hasValidOutboxScope(
  item: Pick<OutboxItem, "tenantId" | "branchId">,
): boolean {
  return (
    typeof item.tenantId === "string" &&
    item.tenantId.trim().length > 0 &&
    typeof item.branchId === "string" &&
    item.branchId.trim().length > 0
  );
}

export function outboxMatchesScope(
  item: Pick<OutboxItem, "tenantId" | "branchId">,
  tenantId?: string,
  branchId?: string,
): boolean {
  if (!hasValidOutboxScope(item)) return false;
  if (tenantId && item.tenantId !== tenantId) return false;
  if (branchId && item.branchId !== branchId) return false;
  return true;
}

export class QueryableStore<T = any> extends Map<string, T> {
  constructor(
    private readonly storeName: NativeStore,
    private readonly onPersist?: (store: NativeStore, key: string, value: any) => void
  ) {
    super();
  }

  where(field: string) {
    return {
      equals: (val: any) => {
        let predicate = (item: T) => item && typeof item === "object" && (item as any)[field] === val;
        return {
          and: (additionalPred: (item: T) => boolean) => {
            const prev = predicate;
            predicate = (item: T) => prev(item) && Boolean(additionalPred(item));
            return {
              toArray: async (): Promise<T[]> => Array.from(this.values()).filter(predicate),
            };
          },
          toArray: async (): Promise<T[]> => Array.from(this.values()).filter(predicate),
        };
      },
    };
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.values());
  }

  async add(item: T): Promise<string> {
    const id = (item && typeof item === "object" && (item as any).id) || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const record = typeof item === "object" && item !== null ? { ...item, id } : item;
    this.set(id, record as any);
    this.onPersist?.(this.storeName, id, record);
    return id;
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    const existing = this.get(id);
    const updated = (typeof existing === "object" && existing !== null && typeof patch === "object" && patch !== null ? { ...existing, ...patch, id } : patch) as unknown as T;
    this.set(id, updated);
    this.onPersist?.(this.storeName, id, updated);
  }
}

function toIndexedDbCloneable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, nested) => {
    if (typeof nested === "bigint") return nested.toString();
    return nested;
  })) as T;
}
export class LocalIndexedDbStore {
  schemaVersion: number;
  products: QueryableStore<Product>;
  productVariants: QueryableStore<ProductVariant>;
  stockLedger: QueryableStore<StockLedger>;
  stockAdjustments: QueryableStore<StockAdjustment>;
  stockBalance: QueryableStore<ProductBranchStock>;
  productPriceHistory: QueryableStore<ProductPriceHistory>;
  sales: QueryableStore<any>;
  payments: QueryableStore<any>;
  receipts: QueryableStore<any>;
  customers: QueryableStore<any>;
  suppliers: QueryableStore<any>;
  contacts: QueryableStore<any>;
  syncOutbox: QueryableStore<OutboxItem>;
  traVfdOutbox: QueryableStore<any>;
  drawerOutbox: QueryableStore<DrawerOutboxItem>;
  syncMetadata: QueryableStore<string>;
  configuration: QueryableStore<any>;
  auditState: QueryableStore<any>;
  migrationJournal: QueryableStore<MigrationJournalEntry>;
  recoverySnapshots: QueryableStore<RecoverySnapshot>;
  updateState: QueryableStore<any>;

  get outbox(): QueryableStore<OutboxItem> {
    return this.syncOutbox;
  }

  readonly ready: Promise<void>;
  private nativeDb: IDBDatabase | null = null;
  readonly dbName: string;
  private persistenceTail: Promise<void> = Promise.resolve();
  private persistenceError: unknown = null;
  private pendingPersistenceWrites = new Map<string, { store: NativeStore; key: string; value?: unknown; delete?: boolean }>();
  private persistenceFlushScheduled = false;

  private scopedSyncKey(tenantId: string, branchId: string, key: string): string {
    if (!tenantId || !branchId) throw new Error("SYNC_CONTEXT_REQUIRED: tenantId and branchId are required");
    return "syncScope:" + tenantId + ":" + branchId + ":" + key;
  }

  constructor(requestedSchemaVersion = AUTHORITATIVE_SCHEMA_VERSION, dbName = DB_NAME) {
    this.dbName = dbName;
    this.schemaVersion =
      Number.isInteger(requestedSchemaVersion) && requestedSchemaVersion > 0
        ? requestedSchemaVersion
        : AUTHORITATIVE_SCHEMA_VERSION;

    const p = (store: NativeStore, key: string, value: any) => this.persist(store, key, value);
    this.products = new QueryableStore<Product>("products", p);
    this.productVariants = new QueryableStore<ProductVariant>("productVariants", p);
    this.stockLedger = new QueryableStore<StockLedger>("stockLedger", p);
    this.stockAdjustments = new QueryableStore<StockAdjustment>("stockAdjustments", p);
    this.stockBalance = new QueryableStore<ProductBranchStock>("stockBalance", p);
    this.productPriceHistory = new QueryableStore<ProductPriceHistory>("productPriceHistory", p);
    this.sales = new QueryableStore<any>("sales", p);
    this.payments = new QueryableStore<any>("payments", p);
    this.receipts = new QueryableStore<any>("receipts", p);
    this.customers = new QueryableStore<any>("customers", p);
    this.suppliers = new QueryableStore<any>("suppliers", p);
    this.contacts = new QueryableStore<any>("contacts", p);
    this.syncOutbox = new QueryableStore<OutboxItem>("syncOutbox", p);
    this.traVfdOutbox = new QueryableStore<any>("traVfdOutbox", p);
    this.drawerOutbox = new QueryableStore<DrawerOutboxItem>("drawerOutbox", p);
    this.syncMetadata = new QueryableStore<string>("syncMetadata", p);
    this.configuration = new QueryableStore<any>("configuration", p);
    this.auditState = new QueryableStore<any>("auditState", p);
    this.migrationJournal = new QueryableStore<MigrationJournalEntry>("migrationJournal", p);
    this.recoverySnapshots = new QueryableStore<RecoverySnapshot>("recoverySnapshots", p);
    this.updateState = new QueryableStore<any>("updateState", p);

    this.ready = this.initializeNativePersistence();
  }

  private async initializeNativePersistence(): Promise<void> {
    if (typeof indexedDB === "undefined") return;

    try {
      const openDb = (ver?: number): Promise<IDBDatabase> => {
        return new Promise((resolve, reject) => {
          // IndexedDB upgrades can legitimately take several seconds when multiple
          // fresh browser contexts initialize concurrently. A short timeout here
          // incorrectly forced a fail-closed persistence state during normal startup.
          const IDB_OPEN_TIMEOUT_MS = 15_000;
          const timeoutTimer = setTimeout(() => {
            reject(new Error(`IndexedDB open timed out after ${IDB_OPEN_TIMEOUT_MS}ms`));
          }, IDB_OPEN_TIMEOUT_MS);

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
            const metadata = transaction?.objectStore("syncMetadata");
            if (metadata) {
              metadata.put(String(db.version), "nativeMigrationVersion");
              metadata.put(new Date().toISOString(), "nativeMigrationAppliedAt:" + db.version);
            }
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
          "products", "productVariants", "stockBalance", "stockLedger", "stockAdjustments",
          "productPriceHistory", "sales", "payments", "receipts", "customers", "suppliers",
          "syncOutbox", "traVfdOutbox", "drawerOutbox", "syncMetadata", "configuration",
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
      this.nativeDb = null;
      this.persistenceError = error instanceof Error ? error : new Error(String(error));
      console.error("[IndexedDB] Local persistence initialization failed; volatile in-memory mode is disabled.", this.persistenceError);
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
      case "contacts":
        return this.contacts;
      case "syncOutbox":
        return this.syncOutbox;
      case "traVfdOutbox":
        return this.traVfdOutbox;
      case "drawerOutbox":
        return this.drawerOutbox;
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

  async refreshStoresFromNative(stores: NativeStore[] = ALL_STORE_NAMES): Promise<void> {
    await this.ready;
    if (!this.nativeDb) return;
    for (const store of stores) {
      if (!this.nativeDb.objectStoreNames.contains(store)) continue;
      const target = this.getTargetMap(store);
      if (!target) continue;
      target.clear();
      await this.hydrateMap(store, target);
    }
  }

  private async reopenNativeConnection(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    await new Promise<void>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open(this.dbName, this.schemaVersion); } catch (error) { reject(error); return; }
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction!;
        globalMigrationEngine.applySchemaUpgrade(db, transaction, event.oldVersion || 0, event.newVersion || this.schemaVersion);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { try { db.close(); } catch { /* ignore */ } };
        this.nativeDb = db;
        resolve();
      };
      request.onerror = () => reject(request.error || new Error("IndexedDB reopen failed"));
      request.onblocked = () => reject(new Error("IndexedDB reopen blocked by another connection"));
    });
  }

  private async hydrateMap<T>(store: NativeStore, target: Map<string, T>): Promise<void> {
    if (!this.nativeDb || !this.nativeDb.objectStoreNames.contains(store)) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
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
        return;
      } catch (error) {
        const invalidState = error instanceof DOMException && error.name === "InvalidStateError";
        if (!invalidState || attempt === 1) throw error;
        await this.reopenNativeConnection();
      }
    }
  }

  public persist<T>(store: NativeStore, key: string, value: T): void {
    if (typeof indexedDB === "undefined") {
      if (typeof window !== "undefined") throw new Error("LOCAL_PERSISTENCE_UNAVAILABLE: IndexedDB is required in the browser");
      return;
    }
    if (this.persistenceError) throw this.persistenceError instanceof Error ? this.persistenceError : new Error(String(this.persistenceError));
    if (!this.nativeDb) throw new Error("LOCAL_PERSISTENCE_UNAVAILABLE: IndexedDB is not ready");
    if (!this.nativeDb.objectStoreNames.contains(store)) return;

    // Stage synchronous saveXLocal() mutations for this turn. The atomic outbox boundary
    // can consume these writes and commit them together with the outbox in one IDB transaction.
    this.pendingPersistenceWrites.set(store + "\0" + key, { store, key, value, delete: false });
    this.schedulePendingPersistenceFlush();
  }

  private schedulePendingPersistenceFlush(): void {
    if (this.persistenceFlushScheduled) return;
    this.persistenceFlushScheduled = true;
    queueMicrotask(() => {
      this.persistenceFlushScheduled = false;
      // A same-turn enqueue or explicit atomic mutation drains these staged writes.
      // Do not let the generic persistence microtask commit them separately first.
      if ((this as any).__kwakoAtomicBatch || (this as any).__kwakoAtomicMutationInFlight) return;
      void this.flushPendingPersistence();
    });
  }

  public drainPendingPersistenceWrites(): Array<{ store: NativeStore; key: string; value?: unknown; delete?: boolean }> {
    const writes = Array.from(this.pendingPersistenceWrites.values());
    this.pendingPersistenceWrites.clear();
    this.persistenceFlushScheduled = false;
    return writes;
  }

  private flushPendingPersistence(): Promise<void> {
    const writes = this.drainPendingPersistenceWrites();
    if (!writes.length) return Promise.resolve();
    this.persistenceTail = this.persistenceTail
      .catch(() => undefined)
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            try {
              const active = writes.filter(({ store }) => this.nativeDb?.objectStoreNames.contains(store));
              if (!this.nativeDb || !active.length) {
                resolve();
                return;
              }
              const stores = [...new Set(active.map(({ store }) => store))];
              const tx = this.nativeDb.transaction(stores, "readwrite");
              for (const write of active) {
                if (write.delete) tx.objectStore(write.store).delete(write.key);
                else tx.objectStore(write.store).put(write.value, write.key);
              }
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error || new Error("IndexedDB batched write failed"));
              tx.onabort = () => reject(tx.error || new Error("IndexedDB batched write aborted"));
            } catch (error) {
              reject(error);
            }
          }),
      )
      .catch((error) => {
        this.persistenceError = error;
        throw error;
      });
    return this.persistenceTail;
  }

  async flushPersistence(): Promise<void> {
    await this.flushPendingPersistence();
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
    this.traVfdOutbox.clear();
    this.drawerOutbox.clear();
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
    filterTenant(this.traVfdOutbox, "traVfdOutbox");
    filterTenant(this.drawerOutbox, "drawerOutbox");
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
    if (!v) return;
    this.productVariants.delete(variantId);
    if (this.nativeDb && this.nativeDb.objectStoreNames.contains("productVariants")) {
      this.pendingPersistenceWrites.set("productVariants" + "\0" + variantId, {
        store: "productVariants",
        key: variantId,
        delete: true,
      });
      this.schedulePendingPersistenceFlush();
    }
    const productId = v.productId;
    if (productId) {
      const p = this.products.get(productId);
      if (p) {
        const remainingVariants: any[] = [];
        for (const varItem of this.productVariants.values()) {
          if (varItem.productId === productId && varItem.id !== variantId) {
            remainingVariants.push(varItem);
          }
        }
        this.saveProductLocal(
          {
            ...p,
            hasVariants: remainingVariants.length > 0,
            variants: remainingVariants,
          },
          (p as any).tenantId ? { tenantId: (p as any).tenantId, branchId: (p as any).branchId } : undefined,
        );
      }
    }
  }

  deleteProductLocal(productId: string): void {
    this.products.delete(productId);
    if (this.nativeDb && this.nativeDb.objectStoreNames.contains("products")) {
      this.pendingPersistenceWrites.set("products" + "\0" + productId, {
        store: "products",
        key: productId,
        delete: true,
      });
      this.schedulePendingPersistenceFlush();
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
    const compoundKey = ctx?.tenantId ? (ctx.branchId ? `${ctx.tenantId}:${ctx.branchId}:${key}` : `${ctx.tenantId}:${key}`) : key;
    const item = { key, value, tenantId: ctx?.tenantId, branchId: ctx?.branchId, updatedAt: new Date().toISOString() };
    this.configuration.set(compoundKey, item);
    this.persist("configuration", compoundKey, item);
  }

  getConfigurationLocal(key: string, ctx?: TenantScopedContext): any {
    if (ctx?.tenantId) {
      const compoundKey = ctx.branchId ? `${ctx.tenantId}:${ctx.branchId}:${key}` : `${ctx.tenantId}:${key}`;
      const item = this.configuration.get(compoundKey);
      return item?.value !== undefined ? item.value : undefined;
    }
    const direct = this.configuration.get(key);
    return direct?.value !== undefined ? direct.value : direct;
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

  getProductsLocal(tenantId?: string, branchId?: string): Product[] {
    const all = [...this.products.values()];
    return tenantId && branchId
      ? all.filter((p) => p.tenantId === tenantId && p.branchId === branchId)
      : tenantId
        ? all.filter((p) => p.tenantId === tenantId)
        : all;
  }

  getProductVariantsLocal(tenantId?: string, branchId?: string): ProductVariant[] {
    const all = [...this.productVariants.values()];
    return tenantId && branchId
      ? all.filter((v: any) => v.tenantId === tenantId && v.branchId === branchId)
      : tenantId
        ? all.filter((v: any) => v.tenantId === tenantId)
        : all;
  }

  getSalesLocal(tenantId?: string): any[] {
    const all = [...this.sales.values()];
    return tenantId ? all.filter((s) => s.tenantId === tenantId) : all;
  }

  getPaymentsLocal(tenantId?: string): any[] {
    const all = [...this.payments.values()];
    return tenantId ? all.filter((p) => p.tenantId === tenantId) : all;
  }

  getCustomersLocal(tenantId?: string, branchId?: string): any[] {
    const all = [...this.customers.values()];
    return tenantId && branchId
      ? all.filter((c) => c.tenantId === tenantId && c.branchId === branchId)
      : tenantId
        ? all.filter((c) => c.tenantId === tenantId)
        : all;
  }

  getSuppliersLocal(tenantId?: string, branchId?: string): any[] {
    const all = [...this.suppliers.values()];
    return tenantId && branchId
      ? all.filter((s) => s.tenantId === tenantId && s.branchId === branchId)
      : tenantId
        ? all.filter((s) => s.tenantId === tenantId)
        : all;
  }

  getStockLedgerLocal(tenantId?: string, branchId?: string): StockLedger[] {
    const all = [...this.stockLedger.values()];
    return tenantId && branchId
      ? all.filter((l) => l.tenantId === tenantId && l.branchId === branchId)
      : tenantId
        ? all.filter((l) => l.tenantId === tenantId)
        : all;
  }

  getStockAdjustmentsLocal(tenantId?: string, branchId?: string): StockAdjustment[] {
    const all = [...this.stockAdjustments.values()];
    return tenantId && branchId
      ? all.filter((a) => a.tenantId === tenantId && a.branchId === branchId)
      : tenantId
        ? all.filter((a) => a.tenantId === tenantId)
        : all;
  }

  getReceiptsLocal(tenantId?: string): any[] {
    const all = [...this.receipts.values()];
    return tenantId ? all.filter((r) => r.tenantId === tenantId) : all;
  }

  recordOutboxMutation(item: OutboxItem, ctx?: TenantScopedContext): void {
    assertSyncOutboxEntityTypeAllowed(String(item.entityType));
    if (ctx?.tenantId && !item.tenantId) {
      item = { ...item, tenantId: ctx.tenantId, branchId: ctx.branchId || item.branchId };
    }
    this.syncOutbox.set(item.id, item);
    this.persist("syncOutbox", item.id, item);
  }

  async enqueueSettingsMutations(
    records: Array<{ key: string; value: unknown; scope?: "TENANT" | "BRANCH" | "USER"; operationType?: "CREATE" | "UPDATE" | "DELETE" }>,
    ctx: TenantScopedContext,
  ): Promise<void> {
    if (!ctx.tenantId || !ctx.branchId || !records.length) throw new Error("SETTINGS_MUTATION_CONTEXT_REQUIRED");
    const writes: Array<{ store: NativeStore; key: string; value?: any; delete?: boolean }> = [];
    const outboxItems: OutboxItem[] = [];
    const now = new Date().toISOString();
    for (const record of records) {
      const operationId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storageKey = `${ctx.tenantId}:${ctx.branchId}:${record.key}`;
      writes.push({
        store: "configuration",
        key: storageKey,
        value: record.operationType === "DELETE"
          ? { key: record.key, tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: false, _deleted: true, updatedAt: now }
          : { key: record.key, value: record.value, tenantId: ctx.tenantId, branchId: ctx.branchId, scope: record.scope || "BRANCH", isActive: true, updatedAt: now },
      });
      outboxItems.push({
        id: operationId, entityType: "Setting", entityId: operationId,
        operationType: record.operationType || "UPDATE", payload: { key: record.key, value: record.value, scope: record.scope || "BRANCH", branchId: ctx.branchId, userId: ctx.userId },
        clientCreatedAt: now, idempotencyKey: "SETTING:" + ctx.tenantId + ":" + ctx.branchId + ":" + record.key + ":" + operationId,
        status: "PENDING", tenantId: ctx.tenantId, branchId: ctx.branchId,
      });
    }
    await this.executeAtomicMutation({ writes, outboxItems, tenantContext: ctx });
  }

  async executeAtomicMutation(params: {
    writes: Array<{ store: NativeStore; key: string; value?: any; delete?: boolean }>;
    outboxItem?: OutboxItem;
    outboxItems?: OutboxItem[];
    drawerOutboxItems?: DrawerOutboxItem[];
    tenantContext?: TenantScopedContext;
  }): Promise<{ outbox: OutboxItem; outboxes: OutboxItem[] }> {
    await this.ready;
    globalStoragePressureMonitor.assertSafeForDestructiveOperation("executeAtomicMutation");
    if (typeof indexedDB !== "undefined" && !this.nativeDb) {
      throw new Error("LOCAL_PERSISTENCE_UNAVAILABLE: IndexedDB is not available for atomic mutation");
    }
    const outboxItems = [...(params.outboxItems || []), ...(params.outboxItem ? [params.outboxItem] : [])];
    const drawerOutboxItems = params.drawerOutboxItems || [];
    if (!outboxItems.length) throw new Error("ATOMIC_MUTATION_OUTBOX_REQUIRED");
    const localCommittedStatuses = outboxItems
      .filter((item) => Boolean(item.tenantId || params.tenantContext?.tenantId))
      .map((item) => {
        const tenantId = item.tenantId || params.tenantContext!.tenantId;
        const branchId = item.branchId || params.tenantContext?.branchId;
        return createPersistenceStatus(
          {
            tenantId,
            branchId,
            entityType: item.entityType,
            entityId: item.entityId,
            operationId: item.id,
            operationType: item.operationType,
          },
          "LOCAL_COMMITTED",
        );
      });
    for (const item of outboxItems) assertSyncOutboxEntityTypeAllowed(String(item.entityType));
    const stagedWrites = this.drainPendingPersistenceWrites();
    const explicitWrites = params.writes.map((write) => ({ ...write }));
    const writeMap = new Map<string, { store: NativeStore; key: string; value?: any; delete?: boolean }>();
    for (const write of stagedWrites) writeMap.set(write.store + "\0" + write.key, write);
    for (const write of explicitWrites) writeMap.set(write.store + "\0" + write.key, write);
    const writes = Array.from(writeMap.values());
    if (params.tenantContext?.tenantId) {
      for (const item of outboxItems) {
        item.tenantId = params.tenantContext.tenantId;
        if (params.tenantContext.branchId) item.branchId = params.tenantContext.branchId;
      }
      for (const write of writes) {
        if (write.value && typeof write.value === "object") {
          write.value = { ...write.value, tenantId: params.tenantContext.tenantId, ...(params.tenantContext.branchId ? { branchId: params.tenantContext.branchId } : {}) };
        }
      }
    }
    const stores = [...new Set([...writes.map((w) => w.store), "syncOutbox", "syncMetadata", ...(drawerOutboxItems.length ? ["drawerOutbox"] : [])])];
    if (this.nativeDb) {
      for (const store of stores) if (!this.nativeDb.objectStoreNames.contains(store)) throw new Error("LOCAL_PERSISTENCE_UNAVAILABLE: missing IndexedDB store " + store);
      const tx = this.nativeDb.transaction(stores, "readwrite");
      for (const write of writes) { if (write.delete) tx.objectStore(write.store).delete(write.key); else tx.objectStore(write.store).put(write.value, write.key); }
      for (const item of outboxItems) tx.objectStore("syncOutbox").put(item, item.id);
      for (const item of drawerOutboxItems) tx.objectStore("drawerOutbox").put(item, item.id);
      for (const status of localCommittedStatuses) {
        tx.objectStore("syncMetadata").put(
          JSON.stringify(status),
          persistenceStatusKey(status.tenantId, status.branchId, status.entityType, status.entityId),
        );
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Atomic mutation failed"));
        tx.onabort = () => reject(tx.error || new Error("Atomic mutation aborted"));
      });
    }
    for (const write of writes) { const target = this.getTargetMap(write.store); if (!target) continue; if (write.delete) target.delete(write.key); else target.set(write.key, write.value); }
    for (const item of outboxItems) this.syncOutbox.set(item.id, item);
    for (const item of drawerOutboxItems) this.drawerOutbox.set(item.id, item);
    for (const status of localCommittedStatuses) {
      const key = persistenceStatusKey(status.tenantId, status.branchId, status.entityType, status.entityId);
      this.syncMetadata.set(key, JSON.stringify(status));
      emitPersistenceStatusChanged(status);
      const item = outboxItems.find(
        (candidate) =>
          candidate.id === status.operationId &&
          candidate.entityType === status.entityType &&
          candidate.entityId === status.entityId,
      );
      if (item) this.setPersistenceStatus(item, "SYNC_PENDING");
    }
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kwakopos:outbox-enqueued", { detail: { items: outboxItems } }));
        if ("BroadcastChannel" in window) {
          const bc = new BroadcastChannel("kwakopos_sync_channel");
          bc.postMessage({
            type: "OUTBOX_MUTATION",
            items: outboxItems.map((item) => ({
              tenantId: item.tenantId,
              branchId: item.branchId,
              operationId: item.id,
              entityType: item.entityType,
              entityId: item.entityId,
            })),
            timestamp: Date.now(),
          });
          bc.close();
        }
      }
    } catch {
      /* ignore broadcast error */
    }
    return { outbox: outboxItems[0], outboxes: outboxItems };
  }

  async executeAtomicBusinessTransaction<T>(params: {
    targetStore: NativeStore;
    entityId: string;
    entityData: T;
    outboxItem: OutboxItem;
    tenantContext?: TenantScopedContext;
  }): Promise<{ entity: T; outbox: OutboxItem }> {
    await this.ready;
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

    return { entity: entityData, outbox: outboxItem };
  }

  private migrationSnapshotMetadataKey(snapshotId: string): string {
    return PRE_V4_MIGRATION_SNAPSHOT_PREFIX + snapshotId;
  }

  private async loadPreV4MigrationSnapshot(snapshotId: string): Promise<RecoverySnapshot | null> {
    const encoded = this.syncMetadata.get(this.migrationSnapshotMetadataKey(snapshotId));
    if (!encoded) return null;

    let snapshot: RecoverySnapshot;
    try {
      snapshot = JSON.parse(encoded) as RecoverySnapshot;
    } catch {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} metadata is invalid`);
    }

    if (snapshot.id !== snapshotId) {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} metadata identity mismatch`);
    }

    const isVerified = await globalSnapshotRecoveryEngine.verifySnapshot(snapshot);
    if (!isVerified) {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} failed integrity verification`);
    }
    return snapshot;
  }

  private async persistMigrationSnapshot(snapshot: RecoverySnapshot): Promise<void> {
    // Migration certification may exercise a closed native connection.
    // Reopen the existing database before selecting the durable snapshot store.
    if (!this.nativeDb && typeof indexedDB !== "undefined") {
      await this.reopenNativeDbAtExistingVersion();
    }
    const legacyKey = this.migrationSnapshotMetadataKey(snapshot.id);

    if (this.nativeDb?.objectStoreNames.contains("recoverySnapshots")) {
      this.recoverySnapshots.set(snapshot.id, snapshot);
      this.persist("recoverySnapshots", snapshot.id, snapshot);

      if (this.nativeDb.objectStoreNames.contains("syncMetadata")) {
        this.syncMetadata.delete(legacyKey);
        this.persistDelete("syncMetadata", legacyKey);
      }
    } else if (this.nativeDb?.objectStoreNames.contains("syncMetadata")) {
      const encoded = JSON.stringify(snapshot);
      this.syncMetadata.set(legacyKey, encoded);
      this.persist("syncMetadata", legacyKey, encoded);
    } else if (typeof indexedDB === "undefined" || !this.nativeDb) {
      this.recoverySnapshots.set(snapshot.id, snapshot);
    } else {
      throw new Error("RECOVERY_ERROR: No durable pre-V4 snapshot store is available");
    }

    await this.flushPersistence();
  }

  async createVerifiedSnapshot(reason: string, appVersion = AUTHORITATIVE_COMPATIBILITY_MATRIX.applicationVersion): Promise<RecoverySnapshot> {
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

    await this.persistMigrationSnapshot(snapshot);
    return snapshot;
  }

  private async reopenNativeDbAtExistingVersion(): Promise<void> {
    if (this.nativeDb || typeof indexedDB === "undefined") return;

    this.nativeDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Recovery database reopen failed"));
      request.onblocked = () => reject(new Error("Recovery database reopen blocked"));
    });

    this.nativeDb.onversionchange = () => {
      try {
        this.nativeDb?.close();
      } catch {
        /* ignore */
      }
    };
  }

  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    let snapshot =
      this.recoverySnapshots.get(snapshotId) ||
      globalSnapshotRecoveryEngine.getSnapshot(snapshotId) ||
      (await this.loadPreV4MigrationSnapshot(snapshotId));

    if (!snapshot) {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} not found`);
    }

    const isVerified = await globalSnapshotRecoveryEngine.verifySnapshot(snapshot);
    if (!isVerified) {
      throw new Error(`RECOVERY_ERROR: Snapshot ${snapshotId} failed integrity verification`);
    }

    await this.reopenNativeDbAtExistingVersion();

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
        await new Promise<void>((resolve, reject) => {
          try {
            const tx = this.nativeDb!.transaction(typedStore, "readwrite");
            const store = tx.objectStore(typedStore);
            store.clear();
            for (const item of items) store.put(item.value, item.key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error(`Snapshot recovery failed: ${typedStore}`));
            tx.onabort = () => reject(tx.error || new Error(`Snapshot recovery aborted: ${typedStore}`));
          } catch (error) {
            reject(error);
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
    this.setPersistenceStatus(pending, "CONFLICT", {
      conflictId: `CONFLICT-${entityType}-${entityId}`,
    });
    return true;
  }

  public mergeLocalDeltasIntoVariant(serverVariant: ProductVariant): ProductVariant {
    const pendingDeltas = Array.from(this.stockAdjustments.values()).filter(
      (adj: any) => adj.variantId === serverVariant.id && adj.status === "PENDING"
    );
    if (pendingDeltas.length === 0) return serverVariant;

    let reconciledQty = Number(serverVariant.inventoryQuantity ?? (serverVariant as any).stock ?? 0);
    for (const delta of pendingDeltas) {
      const change = Number((delta as any).change ?? (delta as any).quantityChange ?? (delta as any).quantity ?? 0);
      reconciledQty += change;
      (delta as any).status = "RECONCILED";
      this.persist("stockAdjustments", delta.id, delta);
    }

    return {
      ...serverVariant,
      inventoryQuantity: reconciledQty,
      stock: reconciledQty,
      lastSyncedAt: Date.now(),
    } as any;
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
    const contacts = Array.isArray((delta as any).contacts) ? (delta as any).contacts : [];
    const categories = Array.isArray(delta.categories) ? delta.categories : [];
    const brands = Array.isArray(delta.brands) ? delta.brands : [];
    const priceHistories = Array.isArray(delta.priceHistories) ? delta.priceHistories : [];
    const expenses = Array.isArray((delta as any).expenses) ? (delta as any).expenses : [];
    const settings = Array.isArray((delta as any).settings) ? (delta as any).settings : [];
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
        const reconciled = this.mergeLocalDeltasIntoVariant(variant);
        this.saveVariantLocal(reconciled);
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
      for (const contact of contacts) {
        if (this.protectServerRecord("CustomerContact", String(contact.id))) continue;
        this.contacts.set(String(contact.id), contact);
        this.persist("contacts", String(contact.id), contact);
        appliedCount += 1;
      }
      if (settings.length) {
        for (const setting of settings as any[]) {
          const tenantId = String(setting.tenantId || "");
          const branchId = String(setting.branchId || (delta as any).branchId || "");
          const keyName = String(setting.key || "");
          if (!tenantId || !keyName) continue;
          const key = tenantId + ":" + branchId + ":" + keyName;
          if (setting.isActive === false || setting._deleted) this.configuration.delete(key);
          else this.configuration.set(key, { key: keyName, value: setting.value, tenantId, branchId, scope: setting.scope || "BRANCH", settingId: setting.id, version: Number(setting.version || 1), updatedAt: setting.updatedAt || delta.serverTimestamp });
          appliedCount += 1;
        }
      }
      if (expenses.length) {
        const ctxTenant = String((expenses[0] as any).tenantId || "");
        const ctxBranch = String((expenses[0] as any).branchId || "");
        const existingExpenses = Array.isArray(this.getConfigurationLocal("expenses", ctxTenant && ctxBranch ? { tenantId: ctxTenant, branchId: ctxBranch } : undefined))
          ? this.getConfigurationLocal("expenses", { tenantId: ctxTenant, branchId: ctxBranch }) : [];
        const merged = new Map((existingExpenses as any[]).map((e: any) => [String(e.id), e]));
        for (const expense of expenses) {
          if (this.protectServerRecord("Expense", expense.id)) continue;
          merged.set(String(expense.id), expense);
          appliedCount += 1;
        }
        this.saveConfigurationLocal("expenses", Array.from(merged.values()), { tenantId: ctxTenant, branchId: ctxBranch });
      }
      for (const history of priceHistories) { this.saveProductPriceHistoryLocal(history as any); appliedCount += 1; }
      if (categories.length) {
        const tenantId = String((categories[0] as any).tenantId || "");
        const branchId = String((categories[0] as any).branchId || (delta as any).branchId || "");
        if (tenantId) this.saveCatalogCategoriesLocal(categories, { tenantId, branchId });
      }
      if (brands.length) {
        const tenantId = String((brands[0] as any).tenantId || "");
        const branchId = String((brands[0] as any).branchId || (delta as any).branchId || "");
        if (tenantId) this.saveCatalogBrandsLocal(brands, { tenantId, branchId });
      }
      await this.flushPersistence();
      this.setSyncMetadata("lastSyncTime", delta.serverTimestamp);
      await this.flushPersistence();
      return appliedCount;
    }

    const txStores = ["products", "productVariants", "stockLedger", "stockAdjustments", "customers", "suppliers", "syncMetadata", "configuration"].filter(
      (s) => this.nativeDb!.objectStoreNames.contains(s),
    );
    const tx = this.nativeDb.transaction(txStores, "readwrite");
    const productsStore = tx.objectStore("products");
    const variantsStore = tx.objectStore("productVariants");
    const ledgerStore = tx.objectStore("stockLedger");
    const adjustmentsStore = tx.objectStore("stockAdjustments");
    const customersStore = tx.objectStore("customers");
    const suppliersStore = tx.objectStore("suppliers");
    const contactsStore = tx.objectStore("contacts");
    const configStore = this.nativeDb!.objectStoreNames.contains("configuration") ? tx.objectStore("configuration") : null;

    for (const product of products) {
      if (
        this.protectServerRecord("Product", product.id) ||
        (product.variants || []).some((v) => this.pendingFor("ProductVariant", v.id))
      )
        continue;
      productsStore.put(toIndexedDbCloneable(product), product.id);
      this.products.set(product.id, product);
      appliedCount += 1;
      for (const variant of product.variants || []) {
        if (this.protectServerRecord("ProductVariant", variant.id)) continue;
        const reconciled = this.mergeLocalDeltasIntoVariant(variant);
        variantsStore.put(toIndexedDbCloneable(reconciled), reconciled.id);
        this.productVariants.set(reconciled.id, reconciled);
        appliedCount += 1;
      }
    }
    for (const variant of variants) {
      if (this.protectServerRecord("ProductVariant", variant.id)) continue;
      const reconciled = this.mergeLocalDeltasIntoVariant(variant);
      variantsStore.put(toIndexedDbCloneable(reconciled), reconciled.id);
      this.productVariants.set(reconciled.id, reconciled);
      appliedCount += 1;
    }
    for (const entry of ledger) {
      ledgerStore.put(toIndexedDbCloneable(entry), entry.id);
      this.stockLedger.set(entry.id, entry);
      appliedCount += 1;
    }
    for (const adjustment of adjustments) {
      if (this.protectServerRecord("StockAdjustment", adjustment.id)) continue;
      adjustmentsStore.put(toIndexedDbCloneable(adjustment), adjustment.id);
      this.stockAdjustments.set(adjustment.id, adjustment);
      appliedCount += 1;
    }
    for (const customer of customers) {
      if (this.protectServerRecord("Customer", customer.id)) continue;
      customersStore.put(toIndexedDbCloneable(customer), customer.id);
      this.customers.set(customer.id, customer);
      appliedCount += 1;
    }
    for (const supplier of suppliers) {
      if (this.protectServerRecord("Supplier", supplier.id)) continue;
      suppliersStore.put(toIndexedDbCloneable(supplier), supplier.id);
      this.suppliers.set(supplier.id, supplier);
      appliedCount += 1;
    }
    if (settings.length && configStore) {
      for (const setting of settings as any[]) {
        const tenantId = String(setting.tenantId || "");
        const branchId = String(setting.branchId || (delta as any).branchId || "");
        const keyName = String(setting.key || "");
        if (!tenantId || !keyName) continue;
        const key = tenantId + ":" + branchId + ":" + keyName;
        if (setting.isActive === false || setting._deleted) {
          configStore.delete(key);
          this.configuration.delete(key);
        } else {
          const value = { key: keyName, value: setting.value, tenantId, branchId, scope: setting.scope || "BRANCH", settingId: setting.id, version: Number(setting.version || 1), updatedAt: setting.updatedAt || delta.serverTimestamp };
          configStore.put(toIndexedDbCloneable(value), key);
          this.configuration.set(key, value);
        }
        appliedCount += 1;
      }
    }

    if (expenses.length) {
      const ctxTenant = String((expenses[0] as any).tenantId || "");
      const ctxBranch = String((expenses[0] as any).branchId || "");
      const configKey = ctxTenant + ":" + ctxBranch + ":expenses";
      const currentValue = this.getConfigurationLocal("expenses", { tenantId: ctxTenant, branchId: ctxBranch });
      const merged = new Map((Array.isArray(currentValue) ? currentValue : []).map((e: any) => [String(e.id), e]));
      for (const expense of expenses) {
        if (this.protectServerRecord("Expense", expense.id)) continue;
        merged.set(String(expense.id), expense);
        appliedCount += 1;
      }
      if (configStore) {
        configStore.put(toIndexedDbCloneable({ key: "expenses", value: Array.from(merged.values()), tenantId: ctxTenant, branchId: ctxBranch, updatedAt: delta.serverTimestamp }), configKey);
      }
      this.configuration.set(configKey, { key: "expenses", value: Array.from(merged.values()), tenantId: ctxTenant, branchId: ctxBranch, updatedAt: delta.serverTimestamp });
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
      const branchId = String((categories[0] as any).branchId || (delta as any).branchId || "");
      if (tenantId) this.saveCatalogCategoriesLocal(categories, { tenantId, branchId });
    }
    if (brands.length) {
      const tenantId = String((brands[0] as any).tenantId || "");
      const branchId = String((brands[0] as any).branchId || (delta as any).branchId || "");
      if (tenantId) this.saveCatalogBrandsLocal(brands, { tenantId, branchId });
    }
    await this.flushPersistence();
    return appliedCount;
  }

  recalculateProductStockLocal(productId: string): void {
    const product = this.products.get(productId);
    if (!product) return;
    const variants: ProductVariant[] = [];
    const ledgerStockByVariant = new Map<string, number>();
    for (const entry of this.stockLedger.values()) {
      const l = entry as any;
      if (l.tenantId !== product.tenantId || l.branchId !== product.branchId) continue;
      if (!l.variantId) continue;
      const change = Number(l.quantityChange ?? l.quantity ?? 0);
      if (Number.isFinite(change)) ledgerStockByVariant.set(String(l.variantId), (ledgerStockByVariant.get(String(l.variantId)) || 0) + change);
    }
    for (const v of this.productVariants.values()) {
      if (v.productId === productId && v.tenantId === product.tenantId && v.branchId === product.branchId) {
        const projectedStock = Math.max(0, ledgerStockByVariant.get(v.id) || 0);
        const projectedVariant = { ...v, inventoryQuantity: projectedStock, stock: projectedStock } as any;
        variants.push(projectedVariant);
        this.productVariants.set(v.id, projectedVariant);
        this.persist("productVariants", v.id, projectedVariant);
      }
    }
    const activeVars = variants.filter((v: any) => v.isActive !== false);
    const sumStock = activeVars.reduce((acc, v) => acc + Number((v as any).inventoryQuantity ?? 0), 0);
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

    const products = Array.isArray(snapshot.products) ? snapshot.products : [];
    const variants = Array.isArray(snapshot.variants) ? snapshot.variants : [];
    const ledger = Array.isArray(snapshot.stockLedger) ? snapshot.stockLedger : [];
    const adjustments = Array.isArray(snapshot.adjustments) ? snapshot.adjustments : [];
    const customers = Array.isArray(snapshot.customers) ? snapshot.customers : [];
    const suppliers = Array.isArray(snapshot.suppliers) ? snapshot.suppliers : [];
    const contacts = Array.isArray((snapshot as any).contacts) ? (snapshot as any).contacts : [];
    const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
    const brands = Array.isArray(snapshot.brands) ? snapshot.brands : [];
    const priceHistories = Array.isArray(snapshot.priceHistories) ? snapshot.priceHistories : [];
    const sales = Array.isArray((snapshot as any).sales) ? (snapshot as any).sales : [];
    const payments = Array.isArray((snapshot as any).payments) ? (snapshot as any).payments : [];
    const purchaseReceipts = Array.isArray((snapshot as any).purchaseReceipts) ? (snapshot as any).purchaseReceipts : [];
    const expenses = Array.isArray((snapshot as any).expenses) ? (snapshot as any).expenses : [];
    const settings = Array.isArray((snapshot as any).settings) ? (snapshot as any).settings : [];

    const tenantId = String(ctx?.tenantId || (snapshot as any).tenantId || products[0]?.tenantId || "");
    const branchId = String(ctx?.branchId || (snapshot as any).branchId || products[0]?.branchId || "branch-default");
    if (!tenantId) throw new Error("SYNC_CONTEXT_REQUIRED: tenantId is required for authoritative bootstrap");
    const serverRevision = String((snapshot as any).serverRevision ?? "0");

    const pending = this.getPendingOutbox(tenantId, branchId);
    const protectedKeys = new Map<NativeStore, Set<string>>();
    const pendingCatalogTypes = new Set<string>();
    const protect = (store: NativeStore, id: string) => { const set = protectedKeys.get(store) || new Set<string>(); set.add(id); protectedKeys.set(store, set); };
    for (const item of pending) {
      const store = item.entityType === "Product" ? "products" : item.entityType === "ProductVariant" ? "productVariants" : item.entityType === "StockAdjustment" ? "stockAdjustments" : item.entityType === "StockLedger" ? "stockLedger" : item.entityType === "ProductPriceHistory" ? "productPriceHistory" : item.entityType === "Sale" ? "sales" : item.entityType === "Payment" ? "payments" : item.entityType === "PurchaseReceipt" || item.entityType === "Receipt" ? "receipts" : item.entityType === "Customer" ? "customers" : item.entityType === "CustomerContact" ? "contacts" : item.entityType === "Supplier" ? "suppliers" : null;
      if (store) protect(store, item.entityId);
      if (item.entityType === "Category" || item.entityType === "Brand") pendingCatalogTypes.add(item.entityType);
      const payload: any = item.payload || {};
      if (item.entityType === "Product") for (const v of Array.isArray(payload.variants) ? payload.variants : []) if (v?.id) protect("productVariants", String(v.id));
      if (item.entityType === "StockAdjustment" && payload.variantId) protect("productVariants", String(payload.variantId));
    }

    const records: Record<NativeStore, any[]> = {
      products, productVariants: variants, stockLedger: ledger, stockAdjustments: adjustments, stockBalance: [], productPriceHistory: priceHistories, sales, payments, receipts: purchaseReceipts, customers, suppliers, contacts, syncOutbox: [], traVfdOutbox: [], drawerOutbox: [], syncMetadata: [], configuration: [], auditState: [], migrationJournal: [], recoverySnapshots: [], updateState: [],
    };
    const replaceStores: NativeStore[] = ["products", "productVariants", "stockLedger", "stockAdjustments", "productPriceHistory", "sales", "payments", "receipts", "customers", "suppliers", "contacts"];
    const isProtected = (store: NativeStore, id: string) => protectedKeys.get(store)?.has(String(id)) === true;
    const isActiveScope = (value: any) => value && value.tenantId === tenantId && value.branchId === branchId;
    const categoryValue = { key: "inventory_categories_meta", value: categories.filter((c: any) => c.isActive !== false).map((c: any) => ({ id: c.id, name: c.name, description: c.description ?? undefined, color: c.color || "#10b981", parentId: c.parentId ?? null, isDefault: false })), tenantId, updatedAt: snapshot.snapshotTimestamp };
    const brandValue = { key: "inventory_brands_meta", value: brands.filter((b: any) => b.isActive !== false).map((b: any) => ({ id: b.id, name: b.name, origin: b.origin ?? undefined, notes: b.notes ?? undefined, isDefault: false })), tenantId, updatedAt: snapshot.snapshotTimestamp };
    const pendingExpenseItems = pending.filter((item) => item.entityType === "Expense");
    const localExpenses = this.getConfigurationLocal("expenses", { tenantId, branchId });
    const protectedExpenseIds = new Set(pendingExpenseItems.map((item) => String(item.entityId)));
    const mergedExpenses = new Map<string, any>();
    for (const row of (Array.isArray(expenses) ? expenses : [])) if (!protectedExpenseIds.has(String(row.id))) mergedExpenses.set(String(row.id), row);
    for (const row of (Array.isArray(localExpenses) ? localExpenses : [])) if (protectedExpenseIds.has(String(row.id))) mergedExpenses.set(String(row.id), row);
    const expenseValue = { key: "expenses", value: Array.from(mergedExpenses.values()), tenantId, branchId, updatedAt: snapshot.snapshotTimestamp };
    const settingValues = (Array.isArray(settings) ? settings : [])
      .filter((row: any) => row && row.tenantId === tenantId && row.isActive !== false && (!row.branchId || row.branchId === branchId))
      .map((row: any) => ({
        key: String(row.key || ""),
        value: row.value,
        tenantId,
        branchId,
        scope: row.scope || "BRANCH",
        settingId: row.id,
        version: Number(row.version || 1),
        updatedAt: row.updatedAt || snapshot.snapshotTimestamp,
      }))
      .filter((row: any) => row.key);

    if (!this.nativeDb) {
      for (const store of replaceStores) {
        const target = this.getTargetMap(store); if (!target) continue;
        const ids = new Set((records[store] || []).map((row: any) => String(row.id)));
        for (const [key, value] of Array.from(target.entries())) if (isActiveScope(value) && !ids.has(String(key)) && !isProtected(store, String(key))) target.delete(key);
        for (const row of records[store] || []) if (!isProtected(store, String(row.id))) target.set(row.id, row);
      }
      if (!pendingCatalogTypes.has("Category")) this.configuration.set(tenantId + ":" + branchId + ":inventory_categories_meta", categoryValue);
      if (!pendingCatalogTypes.has("Brand")) this.configuration.set(tenantId + ":" + branchId + ":inventory_brands_meta", brandValue);
      this.configuration.set(tenantId + ":" + branchId + ":expenses", expenseValue);
      this.persist("configuration", tenantId + ":" + branchId + ":expenses", expenseValue);
      for (const prodId of this.products.keys()) this.recalculateProductStockLocal(prodId);
      this.setSyncMetadata(this.scopedSyncKey(tenantId, branchId, "lastSyncTime"), snapshot.snapshotTimestamp);
      this.setSyncMetadata(this.scopedSyncKey(tenantId, branchId, "lastBootstrapTime"), snapshot.snapshotTimestamp);
      this.setSyncMetadata(this.scopedSyncKey(tenantId, branchId, "lastBootstrapChecksum"), snapshot.integrityChecksum);
      this.setSyncMetadata(this.scopedSyncKey(tenantId, branchId, "lastSyncRevision"), serverRevision);
      await this.flushPersistence();
      return { applied: Object.values(records).reduce((sum, rows) => sum + rows.length, 0) };
    }

    const hydrateStores = replaceStores.filter((store) => this.nativeDb!.objectStoreNames.contains(store));
    await Promise.all(hydrateStores.map((store) => this.hydrateMap(store, this.getTargetMap(store))));
    const txStores = [...replaceStores, "configuration", "syncMetadata"].filter((store) => this.nativeDb!.objectStoreNames.contains(store));
    const tx = this.nativeDb.transaction(txStores, "readwrite");
    for (const store of replaceStores) {
      const os = tx.objectStore(store);
      const target = this.getTargetMap(store);
      if (target) for (const [key, value] of Array.from(target.entries())) if (isActiveScope(value) && !isProtected(store, String(key)) && !new Set((records[store] || []).map((row: any) => String(row.id))).has(String(key))) os.delete(key);
      for (const row of records[store] || []) if (!isProtected(store, String(row.id))) os.put(toIndexedDbCloneable(row), row.id);
    }
    const configStore = tx.objectStore("configuration");
    if (!pendingCatalogTypes.has("Category")) configStore.put(toIndexedDbCloneable(categoryValue), tenantId + ":" + branchId + ":inventory_categories_meta");
    if (!pendingCatalogTypes.has("Brand")) configStore.put(toIndexedDbCloneable(brandValue), tenantId + ":" + branchId + ":inventory_brands_meta");
    configStore.put(toIndexedDbCloneable(expenseValue), tenantId + ":" + branchId + ":expenses");
    for (const setting of settingValues) configStore.put(toIndexedDbCloneable(setting), tenantId + ":" + branchId + ":" + setting.key);
    const md = tx.objectStore("syncMetadata");
    md.put(snapshot.snapshotTimestamp, this.scopedSyncKey(tenantId, branchId, "lastSyncTime"));
    md.put(snapshot.snapshotTimestamp, this.scopedSyncKey(tenantId, branchId, "lastBootstrapTime"));
    md.put(String(snapshot.integrityChecksum || ""), this.scopedSyncKey(tenantId, branchId, "lastBootstrapChecksum"));
    md.put(serverRevision, this.scopedSyncKey(tenantId, branchId, "lastSyncRevision"));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB authoritative bootstrap transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB authoritative bootstrap transaction aborted"));
    });

    for (const store of replaceStores) {
      const target = this.getTargetMap(store);
      if (target) { target.clear(); await this.hydrateMap(store, target); }
    }
    const allConfig = this.configuration;
    if (!pendingCatalogTypes.has("Category")) allConfig.set(tenantId + ":" + branchId + ":inventory_categories_meta", categoryValue);
    if (!pendingCatalogTypes.has("Brand")) allConfig.set(tenantId + ":" + branchId + ":inventory_brands_meta", brandValue);
    allConfig.set(tenantId + ":" + branchId + ":expenses", expenseValue);
    for (const prodId of this.products.keys()) this.recalculateProductStockLocal(prodId);
    this.syncMetadata.set(this.scopedSyncKey(tenantId, branchId, "lastSyncTime"), snapshot.snapshotTimestamp);
    this.syncMetadata.set(this.scopedSyncKey(tenantId, branchId, "lastBootstrapTime"), snapshot.snapshotTimestamp);
    this.syncMetadata.set(this.scopedSyncKey(tenantId, branchId, "lastBootstrapChecksum"), String(snapshot.integrityChecksum || ""));
    this.syncMetadata.set(this.scopedSyncKey(tenantId, branchId, "lastSyncRevision"), serverRevision);
    await this.flushPersistence();
    return { applied: Object.values(records).reduce((sum, rows) => sum + rows.length, 0) };
  }
  generateStateManifest(deviceId: string, tenantId?: string, branchId?: string): SyncStateManifest {
    const products = this.getProductsLocal(tenantId, branchId);
    const variants = this.getProductVariantsLocal(tenantId, branchId);
    const ledger = this.getStockLedgerLocal(tenantId, branchId);
    const adjustments = this.getStockAdjustmentsLocal(tenantId, branchId);
    const customers = this.getCustomersLocal(tenantId, branchId);
    const suppliers = this.getSuppliersLocal(tenantId, branchId);
    const expenses = (Array.isArray(this.getConfigurationLocal("expenses", tenantId && branchId ? { tenantId, branchId } : undefined))
      ? this.getConfigurationLocal("expenses", { tenantId: tenantId || "", branchId: branchId || "" })
      : []) as any[];

    const stockBalances: Record<string, number> = {};
    for (const entry of ledger) {
      const l = entry as any;
      if (!l.variantId) continue;
      const change = Number(l.quantityChange ?? l.quantity ?? 0);
      if (!Number.isFinite(change)) continue;
      stockBalances[String(l.variantId)] = (stockBalances[String(l.variantId)] || 0) + change;
    }
    for (const v of variants) {
      if (!(v.id in stockBalances)) stockBalances[v.id] = 0;
    }

    return {
      deviceId,
      lastSyncTime: tenantId && branchId ? this.syncMetadata.get(this.scopedSyncKey(tenantId, branchId, "lastSyncTime")) || null : this.syncMetadata.get("lastSyncTime") || null,
      schemaVersion: this.schemaVersion,
      storeCounts: {
        products: products.length,
        productVariants: variants.length,
        stockLedger: ledger.length,
        stockAdjustments: adjustments.length,
        customers: customers.length,
        suppliers: suppliers.length,
        expenses: expenses.length,
        syncOutbox: this.getPendingOutbox(tenantId, branchId).length,
      },
      productIds: products.map((p) => p.id),
      variantIds: variants.map((v) => v.id),
      ledgerIds: ledger.map((l) => l.id),
      expenseIds: expenses.map((e: any) => String(e.id)),
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
              : entityType === "CustomerContact"
                ? this.contacts.get(entityId)
                : null;
    const value = row?.updatedAt;
    return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : null;
  }

  createOutboxItem(
    item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>,
  ): OutboxItem {
    const opId =
      item.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `OP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const entityType = (item.entityType || item.entity || "Product") as OutboxItem["entityType"];
    assertSyncOutboxEntityTypeAllowed(String(entityType));
    const entityId = item.entityId || opId;
    const operationType = item.operationType || "CREATE";
    const sourcePayload = item.payload || item.data || {};
    const baseUpdatedAt = this.localUpdatedAt(entityType, entityId);
    const payload =
      (operationType === "UPDATE" || operationType === "DELETE") && baseUpdatedAt && !sourcePayload._baseUpdatedAt
        ? { ...sourcePayload, _baseUpdatedAt: baseUpdatedAt }
        : sourcePayload;
    return {
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
  }

  enqueueOutbox(
    item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>,
  ): OutboxItem {
    const outboxItem = this.createOutboxItem(item);
    this.recordOutboxMutation(outboxItem);
    this.setPersistenceStatus(outboxItem, "SYNC_PENDING");
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
      /* ignore broadcast error in isolated environments */
    }
    return outboxItem;
  }

  getPendingOutbox(tenantId?: string, branchId?: string): OutboxItem[] {
    const all = [...this.syncOutbox.values()].filter((item) => item.status === "PENDING");
    const filtered = all.filter((item) => outboxMatchesScope(item, tenantId, branchId));
    return orderPendingOutbox(filtered);
  }

  async getPendingOutboxCount(tenantId?: string, branchId?: string): Promise<number> {
    await this.ready;
    return this.getPendingOutbox(tenantId, branchId).length;
  }

  getFailedOutbox(tenantId?: string, branchId?: string): OutboxItem[] {
    const all = [...this.syncOutbox.values()].filter((item) => item.status === "FAILED");
    return all.filter((i) => (!tenantId || i.tenantId === tenantId) && (!branchId || i.branchId === branchId));
  }

  public getPersistenceStatus(
    tenantId: string,
    branchId: string | undefined,
    entityType: string,
    entityId: string,
  ): PersistenceStatusRecord | null {
    const raw = this.syncMetadata.get(persistenceStatusKey(tenantId, branchId, entityType, entityId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistenceStatusRecord;
    } catch {
      return null;
    }
  }

  public listPersistenceStatuses(tenantId?: string, branchId?: string): PersistenceStatusRecord[] {
    const records: PersistenceStatusRecord[] = [];
    for (const [key, raw] of this.syncMetadata.entries()) {
      if (!key.startsWith(PERSISTENCE_STATUS_KEY_PREFIX) || typeof raw !== "string") continue;
      try {
        const record = JSON.parse(raw) as PersistenceStatusRecord;
        if (tenantId && record.tenantId !== tenantId) continue;
        if (branchId && (record.branchId || undefined) !== branchId) continue;
        records.push(record);
      } catch {
        /* Ignore malformed observability entries; business data remains authoritative. */
      }
    }
    return records.sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt) || b.operationId.localeCompare(a.operationId));
  }

  public getPersistenceStatusSnapshot(tenantId?: string, branchId?: string): PersistenceStatusSnapshot {
    const records = this.listPersistenceStatuses(tenantId, branchId);
    const counts = emptyPersistenceStatusCounts();
    for (const record of records) {
      counts[record.state] += 1;
    }
    return {
      tenantId: tenantId || null,
      branchId: branchId || null,
      counts,
      total: records.length,
      latest: records[0] || null,
      records: records.slice(0, 100),
    };
  }

  public setPersistenceStatus(
    item: Pick<OutboxItem, "tenantId" | "branchId" | "entityType" | "entityId" | "id" | "operationType">,
    state: PersistenceState,
    details?: { error?: string; conflictId?: string; serverRevision?: string },
  ): PersistenceStatusRecord | null {
    if (!item.tenantId) return null;
    const previous = this.getPersistenceStatus(item.tenantId, item.branchId, item.entityType, item.entityId);
    const lifecyclePrevious = previous?.operationId === item.id ? previous : undefined;
    const record = createPersistenceStatus(
      {
        tenantId: item.tenantId,
        branchId: item.branchId,
        entityType: item.entityType,
        entityId: item.entityId,
        operationId: item.id,
        operationType: item.operationType,
      },
      state,
      lifecyclePrevious,
      details,
    );
    const key = persistenceStatusKey(item.tenantId, item.branchId, item.entityType, item.entityId);
    this.syncMetadata.set(key, JSON.stringify(record));
    this.persist("syncMetadata", key, JSON.stringify(record));
    emitPersistenceStatusChanged(record);
    return record;
  }

  retryFailedOutbox(tenantId?: string, branchId?: string): number {
    // Only retry items that have NOT been permanently abandoned.
    const failed = this.getRetriableFailedOutbox(tenantId, branchId);
    for (const item of failed) {
      item.status = "PENDING";
      this.syncMetadata.delete(`error_${item.id}`);
      this.persist("syncOutbox", item.id, item);
      if (this.nativeDb) this.persistDelete("syncMetadata", `error_${item.id}`);
      this.setPersistenceStatus(item, "SYNC_PENDING");
    }
    return failed.length;
  }

  retryOutbox(operationId: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item || item.status !== "FAILED") return;
    item.status = "PENDING";
    this.syncMetadata.delete(`error_${operationId}`);
    this.persist("syncOutbox", operationId, item);
    if (this.nativeDb) this.persistDelete("syncMetadata", `error_${operationId}`);
    this.setPersistenceStatus(item, "SYNC_PENDING");
  }

  deleteSyncMetadata(key: string): void {
    this.syncMetadata.delete(key);
    if (this.nativeDb) this.persistDelete("syncMetadata", key);
  }

  markOutboxSynced(operationId: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item) return;
    item.status = "SYNCED";
    this.persist("syncOutbox", operationId, item);
    this.setPersistenceStatus(item, item.operationType === "DELETE" ? "TOMBSTONED" : "SERVER_CONFIRMED");
    if (item.entityType === "Sale") {
      const saleId = item.entityId || operationId;
      const sale = this.sales.get(saleId);
      if (sale) {
        sale.syncStatus = "Synced";
        this.persist("sales", saleId, sale);
      }
      // Remove provisional client StockLedger rows after the authoritative Sale has committed.
      for (const [ledgerId, ledger] of Array.from(this.stockLedger.entries())) {
        if (
          ledger.tenantId === item.tenantId &&
          ledger.branchId === item.branchId &&
          ledger.referenceType === "SALE" &&
          ledger.referenceId === saleId &&
          ledger.synced === false
        ) {
          this.stockLedger.delete(ledgerId);
          if (this.nativeDb) this.persistDelete("stockLedger", ledgerId);
        }
      }
      for (const [outboxId, outbox] of Array.from(this.syncOutbox.entries())) {
        if (
          outboxId !== operationId &&
          outbox.tenantId === item.tenantId &&
          outbox.branchId === item.branchId &&
          outbox.entityType === "StockAdjustment" &&
          String(outbox.payload?.referenceType || "").toUpperCase() === "SALE" &&
          String(outbox.payload?.referenceId || "") === saleId
        ) {
          this.syncOutbox.delete(outboxId);
          if (this.nativeDb) this.persistDelete("syncOutbox", outboxId);
        }
      }
    }
  }

  markOutboxConflictResolved(operationId: string, resolution: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item) return;
    item.status = "CONFLICT_RESOLVED";
    item.resolution = resolution;
    delete item.error;
    this.persist("syncOutbox", operationId, item);
    this.syncMetadata.delete("error_" + operationId);
    this.persistDelete("syncMetadata", "error_" + operationId);
    this.setPersistenceStatus(item, "SERVER_CONFIRMED");
  }
  markOutboxFailed(operationId: string, errorReason: string): void {
    const item = this.syncOutbox.get(operationId);
    if (!item) return;
    item.status = "FAILED";
    item.error = errorReason;
    item.retryCount = (item.retryCount ?? 0) + 1;
    // Permanently abandon items that have hit the server-rejection retry cap.
    // They will no longer be re-queued by retryFailedOutbox() and will be
    // excluded from the pending-sync badge count shown to the user.
    if (item.retryCount >= MAX_OUTBOX_RETRIES && !item.abandonedAt) {
      item.abandonedAt = new Date().toISOString();
      console.warn(
        `[Sync] Outbox item ${operationId} (${item.entityType}:${item.entityId}) permanently abandoned after ${item.retryCount} server rejections. Reason: ${errorReason}`,
      );
    }
    this.syncMetadata.set(`error_${operationId}`, errorReason);
    this.persist("syncOutbox", operationId, item);
    this.persist("syncMetadata", `error_${operationId}`, errorReason);
    this.setPersistenceStatus(item, "FAILED", { error: errorReason });
  }

  /**
   * Returns all FAILED outbox items that are NOT permanently abandoned (retryCount < MAX_OUTBOX_RETRIES).
   * These are items that can still be retried safely.
   */
  getRetriableFailedOutbox(tenantId?: string, branchId?: string): OutboxItem[] {
    return this.getFailedOutbox(tenantId, branchId).filter(
      (item) => !item.abandonedAt && (item.retryCount ?? 0) < MAX_OUTBOX_RETRIES,
    );
  }

  /**
   * Returns permanently abandoned outbox items (server-rejected >= MAX_OUTBOX_RETRIES times).
   * These are displayed as a separate "conflict" count, never as "pending sync".
   */
  getAbandonedOutbox(tenantId?: string, branchId?: string): OutboxItem[] {
    return this.getFailedOutbox(tenantId, branchId).filter((item) => Boolean(item.abandonedAt));
  }

  /**
   * Hard-delete outbox items that match an orphan predicate:
   * - Items scoped to a different tenant/branch than the current scope (old test session data)
   * - Abandoned items older than maxAgeDays (default: 30 days)
   *
   * Returns the number of items purged.
   */
  purgeOrphanedOutbox(
    activeTenantId: string,
    activeBranchId: string,
    maxAgeDays = 30,
  ): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let purged = 0;
    for (const [id, item] of this.syncOutbox.entries()) {
      if (item.status === "SYNCED" || item.status === "CONFLICT_RESOLVED") continue; // preserve resolved conflict history
      const isWrongScope =
        (item.tenantId && item.tenantId !== activeTenantId) ||
        (item.branchId && item.branchId !== activeBranchId);
      const isAbandonedStale =
        item.abandonedAt && Date.parse(item.abandonedAt) < cutoff;
      if (isWrongScope || isAbandonedStale) {
        this.syncOutbox.delete(id);
        if (this.nativeDb) this.persistDelete("syncOutbox", id);
        purged++;
      }
    }
    return purged;
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
    await this.ready;
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

          if (targetVersion >= 4) {
            // V4 is the first schema that owns the dedicated recoverySnapshots store.
            // Promote the pre-V4 durable snapshot only after the upgrade transaction commits.
            await this.persistMigrationSnapshot(snapshot);
          } else {
            // Older schemas use syncMetadata only as a temporary migration recovery journal.
            const legacyKey = this.migrationSnapshotMetadataKey(snapshot.id);
            if ((this.nativeDb as IDBDatabase | null)?.objectStoreNames.contains("syncMetadata")) {
              this.syncMetadata.delete(legacyKey);
              this.persistDelete("syncMetadata", legacyKey);
              await this.flushPersistence();
            }
          }
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

export const db = new LocalIndexedDbStore(AUTHORITATIVE_SCHEMA_VERSION);
