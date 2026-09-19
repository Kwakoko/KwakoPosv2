import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import type { TenantContext, SyncPushRequest } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Pillar 4 — Idempotency Scope: Unit Tests", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-idem-001",
      branchId: "branch-idem-001",
      userId: "user-idem-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);
  });

  it("recognizes idempotencyKey across different device IDs and marks as SUCCESS without duplication", async () => {
    const sharedIdempotencyKey = "SHARED-TX-KEY-999";
    const productId = randomUUID();

    // 1. Terminal A pushes the operation with deviceId = "device-A"
    const pushFromDeviceA: SyncPushRequest = {
      clientVersion: "2.12.5",
      deviceId: "device-A",
      operations: [
        {
          operationId: "OP-DEV-A-01",
          entityType: "Product",
          entityId: productId,
          operationType: "CREATE",
          payload: {
            id: productId,
            name: "Mineral Water 500ml",
            sku: "WATER-500",
            category: "Beverages",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: sharedIdempotencyKey,
        },
      ],
    };

    const resA = await syncEngine.processPush(tenantCtx, pushFromDeviceA);
    expect(resA.processedCount).toBe(1);
    expect(resA.results[0].status).toBe("SUCCESS");
    expect(globalInMemoryStore.products.size).toBe(1);

    // 2. Browser cache is cleared or transferred to Device B with deviceId = "device-B-regenerated"
    // Device B replays the exact same mutation with sharedIdempotencyKey
    const pushFromDeviceB: SyncPushRequest = {
      clientVersion: "2.12.5",
      deviceId: "device-B-regenerated",
      operations: [
        {
          operationId: "OP-DEV-B-REPLAY",
          entityType: "Product",
          entityId: productId,
          operationType: "CREATE",
          payload: {
            id: productId,
            name: "Mineral Water 500ml",
            sku: "WATER-500",
            category: "Beverages",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: sharedIdempotencyKey, // same business key!
        },
      ],
    };

    const resB = await syncEngine.processPush(tenantCtx, pushFromDeviceB);

    // Verification Metric: Recognized and processed idempotently without duplicating product
    expect(resB.results[0].status).toBe("ALREADY_PROCESSED");
    expect(globalInMemoryStore.products.size).toBe(1); // Not duplicated
  });
});
