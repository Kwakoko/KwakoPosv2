import { describe, it, expect } from "vitest";
import type { TenantContext } from "@kwakopos2/contracts";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalCommercialRepository,
  InMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";

describe("H-010: High-Throughput Sync Push Load & Concurrency Benchmark", () => {
  it("should process 50 concurrent sync operations within performance SLA without data corruption", async () => {
    // Isolated in-memory store for load benchmark
    process.env.ALLOW_IN_MEMORY_STORE = "true";
    const store = new InMemoryStore();
    const productRepo = new ScopedProductRepository(store);
    const stockRepo = new ScopedStockRepository(store);
    const syncEngine = new SyncEngine(productRepo, stockRepo, globalCommercialRepository, store);

    const ctx: TenantContext = {
      tenantId: "TENANT_LOAD_01",
      branchId: "BRANCH_LOAD_01",
      userId: "USER_LOAD_01",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    const CONCURRENT_OPS = 50;
    const deviceId = "DEVICE-LOAD-BENCH-01";
    const startTime = Date.now();

    // Generate 50 concurrent push operations
    const pushPromises = Array.from({ length: CONCURRENT_OPS }, async (_, idx) => {
      const operationId = `OP-LOAD-${idx}-${Date.now()}`;
      const idempotencyKey = `IDEMP-${idx}-${Date.now()}`;
      return syncEngine.processPush(ctx, {
        deviceId,
        operations: [
          {
            operationId,
            entityType: "Product",
            entityId: `PROD-${idx}`,
            operationType: "CREATE",
            payload: {
              name: `Load Test Product ${idx}`,
              sku: `SKU-LOAD-${idx}`,
              sellingPrice: 1500 + idx,
              buyingPrice: 1000,
            },
            idempotencyKey,
            clientCreatedAt: new Date().toISOString(),
          },
        ],
        manifest: {
          deviceId,
          lastSyncTimestamp: new Date().toISOString(),
          pendingCount: 1,
          clientVersion: "2.12.5",
          schemaVersion: 4,
          syncProtocolVersion: 2,
        },
      });
    });

    const results = await Promise.all(pushPromises);
    const durationMs = Date.now() - startTime;

    // SLA: 50 concurrent ops must finish in under 3000ms in-process
    expect(durationMs).toBeLessThan(3000);

    // All must succeed
    for (const res of results) {
      expect(res.processedCount).toBe(1);
      expect(res.results.length).toBe(1);
      expect(res.results[0].status).toBe("SUCCESS");
    }

    // Verify idempotency replay under concurrency: pushing identical operations must be ALREADY_PROCESSED
    const duplicatePromises = Array.from({ length: 10 }, async (_, idx) => {
      const originalOp = results[idx].results[0];
      return syncEngine.processPush(ctx, {
        deviceId,
        operations: [
          {
            operationId: originalOp.operationId,
            entityType: "Product",
            entityId: `PROD-${idx}`,
            operationType: "CREATE",
            payload: {
              name: `Load Test Product ${idx}`,
              sku: `SKU-LOAD-${idx}`,
              sellingPrice: 1500 + idx,
              buyingPrice: 1000,
            },
            idempotencyKey: originalOp.idempotencyKey,
            clientCreatedAt: new Date().toISOString(),
          },
        ],
      });
    });

    const dupResults = await Promise.all(duplicatePromises);
    for (const dup of dupResults) {
      expect(dup.results[0].status).toBe("ALREADY_PROCESSED");
    }
  });
});
