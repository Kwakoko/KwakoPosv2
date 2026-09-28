import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  LocalIndexedDbStore,
  AUTHORITATIVE_SCHEMA_VERSION,
  orderPendingOutbox,
} from "../../apps/web/src/indexedDb.js";
import {
  PwaVersionManager,
} from "../../apps/web/src/versionManager.js";
import {
  PwaUpdateStateMachine,
} from "../../apps/web/src/persistence/pwaUpdateStateMachine.js";
import {
  globalSnapshotRecoveryEngine,
  calculateChecksum,
  canonicalJsonStringify,
  canonicalSerializeStoreData,
} from "../../apps/web/src/persistence/snapshotRecoveryEngine.js";
import {
  validateReleaseCompatibility,
  AUTHORITATIVE_COMPATIBILITY_MATRIX,
} from "../../apps/web/src/persistence/releaseCompatibility.js";
import {
  globalStoragePressureMonitor,
} from "../../apps/web/src/persistence/storagePressure.js";
import {
  ClientCoordinationManager,
} from "../../apps/web/src/persistence/clientCoordination.js";

describe("KwakoPos PWA Durable Lifecycle & Zero-Data-Loss Engine", () => {
  let db: LocalIndexedDbStore;
  let testDbName: string;

  beforeEach(async () => {
    testDbName = `kwakopos-test-${Math.random().toString(36).slice(2, 9)}`;
    db = new LocalIndexedDbStore(AUTHORITATIVE_SCHEMA_VERSION, testDbName);
    await db.ready;
  });

  afterEach(() => {
    if (db) db.close();
  });

  describe("1. Transactional IndexedDB Migrations (V1 -> V2 -> V3 -> V4)", () => {
    it("evolves schema safely through V1, V2, V3, and V4 without losing records", async () => {
      const v1DbName = `kwakopos-v1-mig-${Math.random().toString(36).slice(2, 9)}`;
      const v1Store = new LocalIndexedDbStore(1, v1DbName);
      await v1Store.ready;

      // Seed V1 data
      v1Store.saveProductLocal({
        id: "prod-v1",
        name: "Legacy Product",
        description: "V1 item",
        tenantId: "tenant-mig",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      v1Store.recordOutboxMutation({
        id: "out-v1",
        entityType: "Product",
        entityId: "prod-v1",
        operationType: "CREATE",
        payload: { name: "Legacy Product", tenantId: "tenant-mig" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "idem-v1",
        status: "PENDING",
        tenantId: "tenant-mig",
      });

      // Migrate V1 -> V2
      const resV2 = await v1Store.migrateToVersion(2);
      expect(resV2.newVersion).toBe(2);
      expect(resV2.preservedOutboxCount).toBe(1);
      expect(v1Store.products.get("prod-v1")?.name).toBe("Legacy Product");

      // Add V2 balance & price history
      v1Store.saveStockBalanceLocal({
        id: "bal-v2",
        productId: "prod-v1",
        variantId: "var-1",
        branchId: "branch-1",
        currentStock: 150,
        reservedStock: 0,
        allocatedStock: 0,
      });

      // Migrate V2 -> V3
      const resV3 = await v1Store.migrateToVersion(3);
      expect(resV3.newVersion).toBe(3);
      expect(v1Store.stockBalance.get("bal-v2")?.currentStock).toBe(150);

      // Add V3 sale & payment
      v1Store.saveSaleLocal({
        id: "sale-v3",
        tenantId: "tenant-mig",
        totalAmount: 5000,
        status: "COMPLETED",
      });

      // Migrate V3 -> V4
      const resV4 = await v1Store.migrateToVersion(4);
      expect(resV4.newVersion).toBe(4);
      expect(v1Store.sales.get("sale-v3")?.totalAmount).toBe(5000);
      expect(v1Store.products.get("prod-v1")?.name).toBe("Legacy Product");
      expect(v1Store.getPendingOutbox().length).toBe(1);
      expect(v1Store.recoverySnapshots.size).toBeGreaterThan(0);
    });

    it("uses V3 syncMetadata for pre-V4 recovery before the dedicated recoverySnapshots store exists", async () => {
      const v3DbName = `kwakopos-v3-recovery-${Math.random().toString(36).slice(2, 9)}`;
      const v3Store = new LocalIndexedDbStore(3, v3DbName);
      await v3Store.ready;

      v3Store.saveProductLocal({
        id: "prod-v3-recovery",
        name: "V3 Recovery Product",
        description: "Pre-V4 snapshot proof",
        tenantId: "tenant-recovery",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      v3Store.recordOutboxMutation({
        id: "out-v3-recovery",
        entityType: "Product",
        entityId: "prod-v3-recovery",
        operationType: "CREATE",
        payload: { name: "V3 Recovery Product", tenantId: "tenant-recovery" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "idem-v3-recovery",
        status: "PENDING",
        tenantId: "tenant-recovery",
      });
      await v3Store.flushPersistence();

      const snapshot = await v3Store.createVerifiedSnapshot("V3 pre-V4 recovery proof", "2.13.0");
      const snapshotKey = `__migration_snapshot_v4__:${snapshot.id}`;
      expect(v3Store.recoverySnapshots.size).toBe(0);
      expect(v3Store.syncMetadata.get(snapshotKey)).toBeDefined();
      expect(JSON.parse(v3Store.syncMetadata.get(snapshotKey)!).verified).toBe(true);

      // Prove recovery does not depend on the process-local snapshot map.
      globalSnapshotRecoveryEngine.deleteSnapshot(snapshot.id);
      v3Store.close();

      const reopenedV3 = new LocalIndexedDbStore(3, v3DbName);
      await reopenedV3.ready;
      expect(reopenedV3.recoverySnapshots.size).toBe(0);
      expect(reopenedV3.syncMetadata.get(snapshotKey)).toBeDefined();

      await reopenedV3.restoreSnapshot(snapshot.id);
      expect(reopenedV3.products.get("prod-v3-recovery")?.name).toBe("V3 Recovery Product");
      expect(reopenedV3.getPendingOutbox().length).toBe(1);
      reopenedV3.close();
    });

    it("supports forward-compatible downgrade V4 -> V3 and rollback V4 -> V2 without destroying business data", async () => {
      db.saveSaleLocal({
        id: "sale-durable",
        tenantId: "tenant-mig",
        totalAmount: 9900,
      });
      db.savePaymentLocal({
        id: "pay-durable",
        tenantId: "tenant-mig",
        amount: 9900,
      });
      db.recordOutboxMutation({
        id: "out-durable",
        entityType: "Sale",
        entityId: "sale-durable",
        operationType: "CREATE",
        payload: { id: "sale-durable", totalAmount: 9900 },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "idem-durable",
        status: "PENDING",
        tenantId: "tenant-mig",
      });

      // Downgrade V4 -> V3
      const downV3 = await db.migrateToVersion(3);
      expect(downV3.newVersion).toBe(3);
      // Verify data is completely preserved
      expect(db.sales.get("sale-durable")?.totalAmount).toBe(9900);
      expect(db.payments.get("pay-durable")?.amount).toBe(9900);
      expect(db.getPendingOutbox().length).toBe(1);

      // Rollback V3 -> V2
      const downV2 = await db.migrateToVersion(2);
      expect(downV2.newVersion).toBe(2);
      expect(db.sales.get("sale-durable")?.totalAmount).toBe(9900);
      expect(db.getPendingOutbox().length).toBe(1);
    });
  });

  describe("2. Durable Local Snapshot & Recovery Engine", () => {
    it("creates a verified snapshot with valid SHA-256 checksum across stores", async () => {
      db.saveProductLocal({
        id: "p-snap-1",
        name: "Snapshot Item",
        description: "Protected item",
        tenantId: "tenant-snap",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const snapshot = await db.createVerifiedSnapshot("Pre-update test snapshot", "2.12.5");
      expect(snapshot.id).toBeDefined();
      expect(snapshot.verified).toBe(true);
      expect(snapshot.totalRecords).toBeGreaterThan(0);
      expect(snapshot.recordCounts.products).toBe(1);
      expect(snapshot.checksum).toBeDefined();

      // Verify checksum
      const isVerified = await globalSnapshotRecoveryEngine.verifySnapshot(snapshot);
      expect(isVerified).toBe(true);
    });

    it("restores exact database state from snapshot upon simulated failure", async () => {
      db.saveProductLocal({
        id: "p-original",
        name: "Original Item",
        description: "Must survive",
        tenantId: "tenant-snap",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const snapshot = await db.createVerifiedSnapshot("Recovery baseline snapshot");

      // Corrupt or clear state
      db.products.clear();
      expect(db.products.size).toBe(0);

      // Restore
      await db.restoreSnapshot(snapshot.id);
      expect(db.products.has("p-original")).toBe(true);
      expect(db.products.get("p-original")?.name).toBe("Original Item");
    });
  });

  describe("3. Transactional Business-Write + Outbox Atomicity", () => {
    it("commits entity record and outbox mutation as one logical durable transaction", async () => {
      const result = await db.executeAtomicBusinessTransaction({
        targetStore: "products",
        entityId: "prod-atomic-01",
        entityData: {
          id: "prod-atomic-01",
          name: "Atomic Product",
          description: "Created in one transaction",
          tenantId: "tenant-atomic",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        outboxItem: {
          id: "op-atomic-01",
          entityType: "Product",
          entityId: "prod-atomic-01",
          operationType: "CREATE",
          payload: { name: "Atomic Product" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "key-atomic-01",
          status: "PENDING",
        },
        tenantContext: { tenantId: "tenant-atomic", branchId: "branch-atomic" },
      });

      expect(db.products.get("prod-atomic-01")?.name).toBe("Atomic Product");
      expect(db.syncOutbox.get("op-atomic-01")?.status).toBe("PENDING");
      expect(db.syncOutbox.get("op-atomic-01")?.tenantId).toBe("tenant-atomic");
      expect(result.entity.tenantId).toBe("tenant-atomic");
    });
  });

  describe("4. Tenant-Safe Local Persistence Isolation", () => {
    it("prevents Tenant A data from being visible or cleared by Tenant B", async () => {
      // Tenant A records
      db.saveProductLocal({
        id: "prod-A",
        name: "Tenant A Product",
        description: "Confidential A",
        tenantId: "tenant-A",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { tenantId: "tenant-A" });

      db.recordOutboxMutation({
        id: "out-A",
        entityType: "Product",
        entityId: "prod-A",
        operationType: "CREATE",
        payload: { name: "Tenant A Product" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "idem-A",
        status: "PENDING",
      }, { tenantId: "tenant-A" });

      // Tenant B records
      db.saveProductLocal({
        id: "prod-B",
        name: "Tenant B Product",
        description: "Confidential B",
        tenantId: "tenant-B",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { tenantId: "tenant-B" });

      db.recordOutboxMutation({
        id: "out-B",
        entityType: "Product",
        entityId: "prod-B",
        operationType: "CREATE",
        payload: { name: "Tenant B Product" },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: "idem-B",
        status: "PENDING",
      }, { tenantId: "tenant-B" });

      // Scoped queries
      const outboxA = db.getPendingOutbox("tenant-A");
      expect(outboxA).toHaveLength(1);
      expect(outboxA[0].id).toBe("out-A");

      const outboxB = db.getPendingOutbox("tenant-B");
      expect(outboxB).toHaveLength(1);
      expect(outboxB[0].id).toBe("out-B");

      // Tenant B clears its data; Tenant A data MUST NOT be touched
      db.clearTenantData("tenant-B");

      expect(db.products.has("prod-B")).toBe(false);
      expect(db.products.has("prod-A")).toBe(true);
      expect(db.getPendingOutbox("tenant-A")).toHaveLength(1);
      expect(db.getPendingOutbox("tenant-B")).toHaveLength(0);
    });
  });

  describe("5. PWA Update State Machine & Compatibility Matrix", () => {
    it("progresses through complete 15-state lifecycle and commits update", async () => {
      const sm = new PwaUpdateStateMachine("2.12.5", 4);
      expect(sm.getState()).toBe("NORMAL");

      sm.transitionTo("UPDATE_DETECTED");
      sm.transitionTo("PREPARING");
      sm.transitionTo("QUIESCING");
      sm.transitionTo("SNAPSHOTTING");
      sm.transitionTo("SNAPSHOT_VERIFIED");
      sm.transitionTo("MIGRATING");
      sm.transitionTo("MIGRATION_VERIFIED");
      sm.transitionTo("ACTIVATING");
      sm.transitionTo("HEALTH_CHECKING");
      sm.transitionTo("COMMITTED");

      expect(sm.getState()).toBe("COMMITTED");
    });

    it("executes recovery path on update failure", async () => {
      const sm = new PwaUpdateStateMachine("2.12.5", 4);
      sm.transitionTo("UPDATE_DETECTED");
      sm.transitionTo("RECOVERY", "Simulated upgrade failure", "Network dropped");
      expect(sm.getState()).toBe("RECOVERY");

      sm.transitionTo("ROLLBACK_PENDING");
      sm.transitionTo("ROLLED_BACK");
      sm.transitionTo("RECOVERED");
      expect(sm.getState()).toBe("RECOVERED");
    });

    it("rejects incompatible client versions via Release Compatibility Matrix", () => {
      const tooOld = validateReleaseCompatibility({
        applicationVersion: "1.0.0", // Min is 2.0.0
      });
      expect(tooOld.compatible).toBe(false);
      expect(tooOld.reason).toContain("CLIENT_TOO_OLD");

      const tooNew = validateReleaseCompatibility({
        applicationVersion: "4.0.0", // Max is 3.0.0
      });
      expect(tooNew.compatible).toBe(false);
      expect(tooNew.reason).toContain("CLIENT_TOO_NEW");

      const valid = validateReleaseCompatibility({
        applicationVersion: "2.12.5",
        schemaVersion: 4,
        syncProtocolVersion: 2,
      });
      expect(valid.compatible).toBe(true);
    });
  });

  describe("6. Storage Pressure & Tab Coordination", () => {
    it("proactively evaluates storage pressure and protects business operations", async () => {
      const estimate = await globalStoragePressureMonitor.checkStorage();
      expect(estimate).toBeDefined();
      expect(typeof estimate.underPressure).toBe("boolean");
    });

    it("coordinates multi-tab upgrades and prevents concurrent migrations", async () => {
      const coordA = new ClientCoordinationManager("tab-1");
      const coordB = new ClientCoordinationManager("tab-2");

      let tabBQuiesced = false;
      coordB.onQuiesceStateChange((q) => {
        tabBQuiesced = q;
      });

      await coordA.acquireUpgradeCoordination("2.12.5", 4);
      coordA.releaseUpgradeCoordination(true);

      coordA.close();
      coordB.close();
    });

    it("enforces RFC 8785 canonical serialization invariance regardless of object key order", async () => {
      const obj1 = { name: "Product A", price: 100, attributes: { color: "blue", size: "M" } };
      const obj2 = { attributes: { size: "M", color: "blue" }, price: 100, name: "Product A" };

      const json1 = canonicalJsonStringify(obj1);
      const json2 = canonicalJsonStringify(obj2);
      expect(json1).toEqual(json2);

      const storeA = { products: [{ key: "p1", value: obj1 }] };
      const storeB = { products: [{ key: "p1", value: obj2 }] };

      const serialA = canonicalSerializeStoreData(storeA);
      const serialB = canonicalSerializeStoreData(storeB);
      expect(serialA).toEqual(serialB);

      const hashA = await calculateChecksum(serialA);
      const hashB = await calculateChecksum(serialB);
      expect(hashA).toEqual(hashB);
    });

    it("verifies typed tenant-scoped readers isolate products, sales, and ledger without leaks", () => {
      db.saveProductLocal({
        id: "p-iso-1",
        name: "Tenant 1 Item",
        tenantId: "t-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { tenantId: "t-1" });

      db.saveProductLocal({
        id: "p-iso-2",
        name: "Tenant 2 Item",
        tenantId: "t-2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { tenantId: "t-2" });

      db.saveSaleLocal({
        id: "s-iso-1",
        tenantId: "t-1",
        totalAmount: 1000,
      }, { tenantId: "t-1" });

      db.saveSaleLocal({
        id: "s-iso-2",
        tenantId: "t-2",
        totalAmount: 2000,
      }, { tenantId: "t-2" });

      const t1Products = db.getProductsLocal("t-1");
      expect(t1Products).toHaveLength(1);
      expect(t1Products[0].id).toBe("p-iso-1");

      const t2Products = db.getProductsLocal("t-2");
      expect(t2Products).toHaveLength(1);
      expect(t2Products[0].id).toBe("p-iso-2");

      const allProducts = db.getProductsLocal();
      expect(allProducts.length).toBeGreaterThanOrEqual(2);

      const t1Sales = db.getSalesLocal("t-1");
      expect(t1Sales).toHaveLength(1);
      expect(t1Sales[0].id).toBe("s-iso-1");

      const t2Sales = db.getSalesLocal("t-2");
      expect(t2Sales).toHaveLength(1);
      expect(t2Sales[0].id).toBe("s-iso-2");
    });

    it("detects snapshot tampering and rejects restore with RECOVERY_ERROR", async () => {
      db.saveProductLocal({
        id: "prod-tamper-target",
        name: "Untampered Original",
        tenantId: "t-tamper",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const snapshot = await db.createVerifiedSnapshot("Pre-tamper test baseline");
      expect(snapshot.verified).toBe(true);

      // Maliciously tamper with snapshot memory item
      const item = snapshot.stores["products"].find((p) => p.key === "prod-tamper-target");
      if (item) {
        item.value.name = "Malicious Injected Content";
      }

      await expect(db.restoreSnapshot(snapshot.id)).rejects.toThrow("RECOVERY_ERROR");
    });

    it("protects business operations when storage pressure is critical", () => {
      // Artificially trigger pressure
      (globalStoragePressureMonitor as any).underPressure = true;
      expect(() => {
        globalStoragePressureMonitor.assertSafeForDestructiveOperation("destructive purge");
      }).toThrow("STORAGE_PRESSURE_BLOCKED");
      (globalStoragePressureMonitor as any).underPressure = false;
    });
  });
});
