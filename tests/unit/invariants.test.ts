import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateAvailableStock,
  assertProductVariantImmutability,
  assertVariantIdentityPersistence,
  assertLedgerRequiredForStockMutation,
  assertAdjustmentAuditable,
  assertTenantIsolation,
  assertVerifiedTrafficPromotion,
  assertReleaseIdentityMatch,
} from "@kwakopos2/domain";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("KwakoPos 2.0 Core Invariants Automated Suite", () => {
  let ctx: TenantContext;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();
    ctx = {
      tenantId: "tenant-uuid-001",
      branchId: "branch-uuid-001",
      userId: "user-uuid-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };
    productRepo = new ScopedProductRepository(globalInMemoryStore);
    stockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(productRepo, stockRepo, globalInMemoryStore);
  });

  it("INVARIANT 001: Product cannot lose variants on product update", () => {
    const p = productRepo.createProduct(ctx, {
      name: "Coca Cola",
      sku: "COKE-PARENT",
      variants: [{ name: "500ml", sku: "COKE-500", price: 1.5, costPrice: 1.0 }],
    });

    expect(p.variants).toHaveLength(1);
    const existingVariants = p.variants!;

    expect(() => assertProductVariantImmutability(existingVariants, [])).toThrowError(
      /INVARIANT_001_VIOLATION/
    );

    expect(() => assertProductVariantImmutability(existingVariants, [existingVariants[0].id])).not.toThrow();
  });

  it("INVARIANT 002: Variant identity survives synchronization", () => {
    const persistentId = "variant-permanent-uuid-123";
    expect(() => assertVariantIdentityPersistence(persistentId, persistentId)).not.toThrow();
    expect(() => assertVariantIdentityPersistence(persistentId, "variant-recreated-456")).toThrowError(
      /INVARIANT_002_VIOLATION/
    );
  });

  it("INVARIANT 003: Stock changes require ledger movements", () => {
    expect(() => assertLedgerRequiredForStockMutation("" as any, 10)).toThrowError(
      /INVARIANT_003_VIOLATION/
    );
    expect(() => assertLedgerRequiredForStockMutation("PURCHASE", 50)).not.toThrow();
  });

  it("INVARIANT 004: Every stock adjustment is auditable", () => {
    const invalidAdjustment = { reason: "Missing metadata" };
    expect(() => assertAdjustmentAuditable(invalidAdjustment)).toThrowError(
      /INVARIANT_004_VIOLATION/
    );

    const validAdjustment = {
      createdByUserId: ctx.userId,
      reason: "Inventory Audit",
      deviceId: "device-01",
      operationId: "op-101",
      idempotencyKey: "key-101",
    };
    expect(() => assertAdjustmentAuditable(validAdjustment)).not.toThrow();
  });

  it("INVARIANT 005: Duplicate sync operations are idempotent", () => {
    const opId = "OP-SYNC-1001";
    const idempotencyKey = "DEV-A/OP-SYNC-1001";

    const pushPayload = {
      deviceId: "device-A",
      operations: [
        {
          operationId: opId,
          entityType: "Product" as const,
          entityId: randomUUID(),
          operationType: "CREATE" as const,
          payload: { name: "Pepsi", sku: "PEPSI-01" },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey,
        },
      ],
    };

    const res1 = syncEngine.processPush(ctx, pushPayload);
    expect(res1.processedCount).toBe(1);
    expect(res1.results[0].status).toBe("SUCCESS");

    for (let i = 0; i < 5; i++) {
      const resDuplicate = syncEngine.processPush(ctx, pushPayload);
      expect(resDuplicate.processedCount).toBe(0);
      expect(resDuplicate.results[0].status).toBe("ALREADY_PROCESSED");
    }

    const products = productRepo.getProducts(ctx);
    expect(products.filter((p) => p.sku === "PEPSI-01")).toHaveLength(1);
  });

  it("INVARIANT 006 & INVARIANT 010: Server is authoritative for stock ledger calculation", () => {
    const ledgerEntries: any[] = [
      { movementType: "OPENING", quantity: 100 },
      { movementType: "PURCHASE", quantity: 50 },
      { movementType: "SALE", quantity: -20 },
      { movementType: "ADJUSTMENT", quantity: -5 },
    ];

    const stock = calculateAvailableStock(ledgerEntries);
    expect(stock).toBe(125);
  });

  it("INVARIANT 007: Tenant isolation is mandatory", () => {
    const tenantA: TenantContext = {
      tenantId: "tenant-A",
      branchId: "branch-A",
      userId: "user-A",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    expect(() => assertTenantIsolation(tenantA, "tenant-B", "branch-B")).toThrowError(
      /INVARIANT_007_VIOLATION/
    );
    expect(() => assertTenantIsolation(tenantA, "tenant-A", "branch-A")).not.toThrow();
  });

  it("INVARIANT 008: Unverified Cloud Run revisions cannot receive production traffic", () => {
    expect(() => assertVerifiedTrafficPromotion(false, 100)).toThrowError(
      /INVARIANT_008_VIOLATION/
    );
    expect(() => assertVerifiedTrafficPromotion(true, 100)).not.toThrow();
  });

  it("INVARIANT 009: Production release identity must match Git SHA + digest + revision", () => {
    const identity = {
      gitSha: "df2a5cd188000000000000000000000000000000",
      containerDigest: "sha256:efd6bc4300000000000000000000000000000000000000000000000000000000",
      cloudRunRevision: "kwakopos-production-rev-00001",
      appVersion: "2.0.0",
    };

    expect(() => assertReleaseIdentityMatch(identity, identity)).not.toThrow();

    const invalidSha = { ...identity, gitSha: "mismatched-sha" };
    expect(() => assertReleaseIdentityMatch(invalidSha, identity)).toThrowError(/SECURITY_VIOLATION/);

    const tamperedSha = { ...identity, gitSha: "1111111111111111111111111111111111111111" };
    expect(() => assertReleaseIdentityMatch(tamperedSha, identity)).toThrowError(/INVARIANT_009_VIOLATION/);
  });
});
