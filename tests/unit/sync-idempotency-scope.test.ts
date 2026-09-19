import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Idempotency Replay Across Regenerated Device IDs", () => {
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

  it("allows idempotent replay of operations even when client deviceId is regenerated", async () => {
    const customerId = randomUUID();
    const idempotencyKey = `CUST-CREATE-${customerId}`;
    const op = {
      operationId: "OP-CUST-100",
      entityType: "Customer",
      entityId: customerId,
      operationType: "CREATE" as const,
      payload: { name: "Amina Juma", phone: "+255712345678" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey,
    };

    // 1. Initial push from Terminal A (deviceId: "terminal-alpha-01")
    const res1 = await syncEngine.processPush(tenantCtx, {
      deviceId: "terminal-alpha-01",
      operations: [op],
    });

    expect(res1.processedCount).toBe(1);
    expect(res1.results[0].status).toBe("SUCCESS");

    // 2. Terminal cache is wiped; client regenerates device ID to "terminal-alpha-REGEN-99"
    // Client sync queue resubmits the same operation with same idempotency key
    const res2 = await syncEngine.processPush(tenantCtx, {
      deviceId: "terminal-alpha-REGEN-99",
      operations: [op],
    });

    // Should recognize the operation as ALREADY_PROCESSED rather than failing on duplicate key
    expect(res2.results[0].status).toBe("ALREADY_PROCESSED");
    expect(res2.results[0].operationId).toBe("OP-CUST-100");
  });
});
