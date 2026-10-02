import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { assertTenantIsolation } from "@kwakopos2/domain";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Tenant & Branch Multi-Tenant Security Suite", () => {
  let tenantACtx: TenantContext;
  let tenantBCtx: TenantContext;
  let branchA2Ctx: TenantContext;
  let productRepo: ScopedProductRepository;
  let stockRepo: ScopedStockRepository;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantACtx = {
      tenantId: "tenant-alpha",
      branchId: "branch-alpha-1",
      userId: "user-alpha-admin",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    branchA2Ctx = {
      tenantId: "tenant-alpha",
      branchId: "branch-alpha-2",
      userId: "user-alpha-clerk",
      roles: ["CASHIER"],
      permissions: ["products:read"],
    };

    tenantBCtx = {
      tenantId: "tenant-beta",
      branchId: "branch-beta-1",
      userId: "user-beta-admin",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    productRepo = new ScopedProductRepository(globalInMemoryStore);
    stockRepo = new ScopedStockRepository(globalInMemoryStore);
  });

  it("prevents Tenant B from reading Tenant A product catalog", () => {
    const productA = productRepo.createProduct(tenantACtx, {
      name: "Alpha Exclusive Coffee",
      sku: "SKU-ALPHA-COFFEE",
      variants: [{ name: "Standard", sku: "VAR-ALPHA-COFFEE", price: 5, costPrice: 2 }],
    });

    const tenantAProducts = productRepo.getProducts(tenantACtx);
    expect(tenantAProducts).toHaveLength(1);
    expect(tenantAProducts[0].id).toBe(productA.id);

    // Tenant B queries catalog - must receive empty list
    const tenantBProducts = productRepo.getProducts(tenantBCtx);
    expect(tenantBProducts).toHaveLength(0);

    // Tenant B attempts direct get by ID - must throw Tenant Isolation violation
    expect(() => productRepo.getProductById(tenantBCtx, productA.id)).toThrow(
      /INVARIANT_007_VIOLATION.*Cross-tenant access denied/
    );
  });


  it("rejects missing branch context and excludes branchless records", () => {
    const productA = productRepo.createProduct(tenantACtx, {
      name: "Alpha Branch Scoped Product",
      sku: "SKU-STRICT-BRANCH",
      variants: [{ name: "Standard", sku: "VAR-STRICT-BRANCH", price: 10, costPrice: 5 }],
    });

    const malformed = { ...productA, id: "branchless-product", branchId: "" } as any;
    globalInMemoryStore.products.set(malformed.id, malformed);

    expect(() => productRepo.getProducts({ ...tenantACtx, branchId: undefined } as any)).toThrow(
      /TENANT_BRANCH_CONTEXT_REQUIRED/
    );

    const scoped = productRepo.getProducts(tenantACtx);
    expect(scoped.map((p) => p.id)).toEqual([productA.id]);
    expect(scoped.some((p) => p.id === malformed.id)).toBe(false);
  });

  it("prevents Tenant B from adjusting stock on Tenant A variant", () => {
    const productA = productRepo.createProduct(tenantACtx, {
      name: "Alpha Premium Tea",
      sku: "SKU-ALPHA-TEA",
      variants: [{ name: "Box of 20", sku: "VAR-ALPHA-TEA", price: 8, costPrice: 4 }],
    });

    const variantId = productA.variants![0].id;

    // Tenant A adds 100 units
    stockRepo.recordStockAdjustment(tenantACtx, {
      variantId,
      adjustmentType: "INCREASE",
      quantityChange: 100,
      reason: "Initial Intake",
      deviceId: "dev-a1",
      operationId: "op-a1",
      idempotencyKey: "key-a1",
    });

    expect(stockRepo.getAvailableStock(tenantACtx, variantId)).toBe(100);

    // Tenant B attempts to mutate Tenant A variant stock
    expect(() =>
      stockRepo.recordStockAdjustment(tenantBCtx, {
        variantId,
        adjustmentType: "DECREASE",
        quantityChange: 50,
        reason: "Malicious Deduction",
        deviceId: "dev-b1",
        operationId: "op-b1",
        idempotencyKey: "key-b1",
      })
    ).toThrow(/INVARIANT_007_VIOLATION.*Cross-tenant access denied/);

    // Stock for Tenant A remains uncorrupted at 100
    expect(stockRepo.getAvailableStock(tenantACtx, variantId)).toBe(100);
  });

  it("enforces branch boundaries between branches of the same tenant", () => {
    const productA1 = productRepo.createProduct(tenantACtx, {
      name: "Alpha Branch 1 Special",
      sku: "SKU-B1-SPEC",
      variants: [{ name: "Single", sku: "VAR-B1-SPEC", price: 12, costPrice: 6 }],
    });

    // Branch 2 attempts direct access on Branch 1 resource
    expect(() =>
      assertTenantIsolation(branchA2Ctx, productA1.tenantId, productA1.branchId)
    ).toThrow(/INVARIANT_007_VIOLATION.*Cross-branch access denied/);
  });
});