import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("KwakoPos v2 — Convergence Chaos & Failure Injection Suite", () => {
  let ctx: TenantContext;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;
  let commercialRepo: ScopedCommercialRepository;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    ctx = {
      tenantId: "tenant-chaos-001",
      branchId: "branch-chaos-001",
      userId: "user-chaos-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    productRepo = new ScopedProductRepository(globalInMemoryStore);
    stockRepo = new ScopedStockRepository(globalInMemoryStore);
    commercialRepo = new ScopedCommercialRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(productRepo, stockRepo, commercialRepo, globalInMemoryStore);
  });

  it("Chaos 1: Stale device replay blocked when client sync epoch is obsolete", () => {
    // Current rollback epoch is advanced to 1005
    globalInMemoryStore.syncEpochs.set(ctx.tenantId, 1005);

    const staleReq = {
      deviceId: "device-stale-01",
      syncEpoch: 1000, // Obsolete epoch!
      operations: [
        {
          operationId: randomUUID(),
          entityType: "Product",
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { name: "Stale Epoch Item", sku: "STALE-001" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "STALE-OP-001",
        },
      ],
    };

    expect(() => syncEngine.processPush(ctx, staleReq)).toThrow(
      /STALE_ROLLBACK_EPOCH_CONFLICT/
    );
  });

  it("Chaos 2: Rollback barrier freezes all mutations fail-closed during active rollback", () => {
    // Activate rollback sync barrier
    globalInMemoryStore.rollbackSyncBarriers.set(ctx.tenantId, true);

    const mutationReq = {
      deviceId: "device-barrier-01",
      syncEpoch: 1000,
      operations: [
        {
          operationId: randomUUID(),
          entityType: "Product",
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { name: "Barrier Test Item", sku: "BARRIER-001" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "BARRIER-OP-001",
        },
      ],
    };

    expect(() => syncEngine.processPush(ctx, mutationReq)).toThrow(
      /MUTATIONS_FROZEN_ROLLBACK_IN_PROGRESS/
    );
  });

  it("Chaos 3: Privilege escalation attempt in sync payload is rejected immediately", () => {
    const maliciousReq = {
      deviceId: "device-attacker",
      operations: [
        {
          operationId: randomUUID(),
          entityType: "SuperAdmin", // Disallowed entity!
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { email: "hacker@evil.com", role: "SUPER_ADMIN" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "ESCALATION-001",
        },
        {
          operationId: randomUUID(),
          entityType: "Employee",
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { firstName: "Sensitive", baseSalary: 1000000 },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "EMPLOYEE-SYNC-001",
        },
      ],
    };

    const res = syncEngine.processPush(ctx, maliciousReq);
    expect(res.results[0].status).toBe("FAILED");
    expect(res.results[0].error).toMatch(/PRIVILEGE_ESCALATION_ATTEMPT_DENIED/);
    expect(res.results[1].status).toBe("FAILED");
    expect(res.results[1].error).toMatch(/PRIVILEGE_ESCALATION_ATTEMPT_DENIED/);
  });

  it("Chaos 4: Stale write conflict detected when client updates product based on outdated timestamp", () => {
    // Product created on server at T1
    const prod = productRepo.createProduct(ctx, {
      name: "Price Stable Widget",
      sku: "WIDGET-01",
    });

    // Server updates product at T2
    productRepo.updateProduct(ctx, prod.id, {
      name: "Price Updated Widget",
    });

    // Client attempts to update product using stale base timestamp (T0)
    const stalePush = {
      deviceId: "dev-stale-editor",
      operations: [
        {
          operationId: randomUUID(),
          entityType: "Product",
          entityId: prod.id,
          operationType: "UPDATE" as const,
          payload: {
            name: "Stale Overwrite Attempt",
            _baseUpdatedAt: new Date(Date.now() - 100000).toISOString(), // Past timestamp
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "STALE-UPDATE-001",
        },
      ],
    };

    const res = syncEngine.processPush(ctx, stalePush);
    expect(res.results[0].status).toBe("FAILED");
    expect(res.results[0].error).toMatch(/STALE_WRITE_CONFLICT/);
  });

  it("Chaos 5: Out-of-order delivery automatically resolved by topological dependency ranker", () => {
    const prodId = randomUUID();
    const varId = randomUUID();

    // Client sends variant CREATE before product CREATE in the raw array
    const disorderedReq = {
      deviceId: "dev-disordered",
      operations: [
        {
          operationId: "OP-CHILD-VARIANT",
          entityType: "ProductVariant",
          entityId: varId,
          operationType: "CREATE" as const,
          payload: { productId: prodId, name: "Disordered Variant", sku: "DIS-01", price: 10, costPrice: 5 },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-DISORDER-02",
        },
        {
          operationId: "OP-PARENT-PRODUCT",
          entityType: "Product",
          entityId: prodId,
          operationType: "CREATE" as const,
          payload: { name: "Disordered Parent", sku: "DIS-PARENT" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "KEY-DISORDER-01",
        },
      ],
    };

    // Engine sorts dependencies and applies product before variant!
    const res = syncEngine.processPush(ctx, disorderedReq);
    expect(res.processedCount).toBe(2);
    expect(res.results.every((r) => r.status === "SUCCESS")).toBe(true);

    const savedProd = productRepo.getProductById(ctx, prodId);
    expect(savedProd).toBeDefined();
    expect(savedProd!.variants).toHaveLength(1);
  });
});
