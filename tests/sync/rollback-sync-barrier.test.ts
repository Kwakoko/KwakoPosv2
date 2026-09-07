import { describe, it, expect, beforeEach } from "vitest";
import {
  SyncEngine,
  validateSyncEpoch,
  checkRollbackBarrier,
} from "@kwakopos2/sync";
import {
  InMemoryStore,
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedRollbackRepository,
} from "@kwakopos2/database";
import type { SyncPushRequest, TenantContext } from "@kwakopos2/contracts";

describe("Rollback Offline-First Safety & Sync Barrier Protocol", () => {
  let store: InMemoryStore;
  let syncEngine: SyncEngine;
  let rollbackRepo: ScopedRollbackRepository;

  const tenantId = "tenant-offline-safeguard";
  const branchId = "branch-keko";
  const deviceId = "pos-terminal-04";

  const ctx: TenantContext = {
    tenantId,
    branchId,
    userId: "cashier-01",
    roles: ["CASHIER"],
    permissions: ["*"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    const productRepo = new ScopedProductRepository(store);
    const stockRepo = new ScopedStockRepository(store);
    syncEngine = new SyncEngine(productRepo, stockRepo, store);
    rollbackRepo = new ScopedRollbackRepository(store);
  });

  it("validateSyncEpoch unit function detects obsolete client sync epochs", () => {
    // Current epoch 1005, client sends 1004 -> MUST throw
    expect(() => {
      validateSyncEpoch(1004, 1005);
    }).toThrow(/STALE_ROLLBACK_EPOCH_CONFLICT/);

    // Current epoch 1005, client sends 1005 -> MUST pass
    expect(() => {
      validateSyncEpoch(1005, 1005);
    }).not.toThrow();

    // Client ahead (1006) -> MUST pass
    expect(() => {
      validateSyncEpoch(1006, 1005);
    }).not.toThrow();

    // Client epoch undefined -> does not throw
    expect(() => {
      validateSyncEpoch(undefined, 1005);
    }).not.toThrow();
  });

  it("checkRollbackBarrier unit function throws when barrier is active", () => {
    expect(() => {
      checkRollbackBarrier(true);
    }).toThrow(/MUTATIONS_FROZEN_ROLLBACK_IN_PROGRESS/);

    expect(() => {
      checkRollbackBarrier(false);
    }).not.toThrow();
  });

  it("SyncEngine freezes mutations during active rollback sync barrier", async () => {
    const pushReq: SyncPushRequest = {
      deviceId,
      operations: [
        {
          operationId: "op-prod-1",
          idempotencyKey: "idem-prod-1",
          entityType: "Product",
          entityId: "prod-999",
          operationType: "CREATE",
          clientCreatedAt: new Date().toISOString(),
          payload: {
            name: "Vodacom Voucher 10k",
            sku: "VOUCHER-10K",
            sellingPrice: 10000,
            costPrice: 9500,
            stockQuantity: 50,
          },
        },
      ],
    };

    // Before barrier: mutations pass
    const res1 = syncEngine.processPush(ctx, pushReq);
    expect(res1.processedCount).toBe(1);

    // Activate rollback sync barrier on branch
    await rollbackRepo.setSyncBarrier(tenantId, branchId, true);

    // During active barrier: mutations MUST be frozen
    expect(() => {
      syncEngine.processPush(ctx, pushReq);
    }).toThrow(/MUTATIONS_FROZEN_ROLLBACK_IN_PROGRESS/);

    // Clear rollback sync barrier
    await rollbackRepo.setSyncBarrier(tenantId, branchId, false);

    // After barrier is released: mutations resume
    const res2 = syncEngine.processPush(ctx, {
      deviceId,
      operations: [
        {
          operationId: "op-prod-2",
          idempotencyKey: "idem-prod-2",
          entityType: "Product",
          entityId: "prod-1000",
          operationType: "CREATE",
          clientCreatedAt: new Date().toISOString(),
          payload: {
            name: "Airtel Voucher 5k",
            sku: "VOUCHER-AIRTEL-5K",
            sellingPrice: 5000,
            costPrice: 4800,
            stockQuantity: 100,
          },
        },
      ],
    });
    expect(res2.processedCount).toBe(1);
  });

  it("SyncEngine prevents stale offline client replay by verifying sync epoch post-rollback", async () => {
    const staleReq: any = {
      deviceId,
      syncEpoch: 1000,
      operations: [
        {
          operationId: "op-stale-1",
          idempotencyKey: "idem-stale-1",
          entityType: "Product",
          entityId: "prod-stale-01",
          operationType: "CREATE",
          clientCreatedAt: new Date().toISOString(),
          payload: {
            name: "Stale Product",
            sku: "STALE-001",
            sellingPrice: 15000,
            costPrice: 12000,
            stockQuantity: 10,
          },
        },
      ],
    };

    // Client syncing with current epoch 1000 works
    const res1 = syncEngine.processPush(ctx, staleReq);
    expect(res1.processedCount).toBe(1);

    // A rollback occurs and increments the sync epoch
    const newEpoch = await rollbackRepo.incrementSyncEpoch(tenantId, branchId);
    expect(newEpoch).toBe(1001);

    // Stale client trying to replay with obsolete epoch 1000 is quarantined/rejected
    expect(() => {
      syncEngine.processPush(ctx, staleReq);
    }).toThrow(/STALE_ROLLBACK_EPOCH_CONFLICT/);

    // Client updates its local epoch to 1001 after re-synchronizing baseline
    const updatedClientReq: any = {
      ...staleReq,
      syncEpoch: 1001,
      operations: [
        {
          operationId: "op-fresh-1",
          idempotencyKey: "idem-fresh-1",
          entityType: "Product",
          entityId: "prod-fresh-01",
          operationType: "CREATE",
          clientCreatedAt: new Date().toISOString(),
          payload: {
            name: "Fresh Product Post Rollback",
            sku: "FRESH-001",
            sellingPrice: 20000,
            costPrice: 16000,
            stockQuantity: 25,
          },
        },
      ],
    };

    const res2 = syncEngine.processPush(ctx, updatedClientReq);
    expect(res2.processedCount).toBe(1);
  });
});
