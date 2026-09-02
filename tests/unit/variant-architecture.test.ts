import { describe, it, expect, beforeEach } from "vitest";
import { ScopedProductRepository, InMemoryStore } from "@kwakopos2/database";
import { globalRetailEngine } from "@kwakopos2/domain";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Variant-First Architecture Core Unit Tests", () => {
  let store: InMemoryStore;
  let repo: ScopedProductRepository;
  const ctx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["ADMIN"],
    permissions: ["PRODUCT_CREATE", "PRODUCT_EDIT"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedProductRepository(store);
  });

  it("1. Parent Product stock must equal the sum of all active variant stock quantities", () => {
    const product = repo.createProduct(ctx, {
      name: "T-Shirt Premium Cotton",
      sku: "TSHIRT-COTTON",
      buyingPrice: 15000,
      sellingPrice: 25000,
      hasVariants: true,
    });

    const v1 = repo.addVariant(ctx, product.id, {
      name: "Size: Small / Color: Red",
      sku: "TSHIRT-COTTON-S-RED",
      inventoryQuantity: 25,
      reorderLevel: 5,
    });

    const v2 = repo.addVariant(ctx, product.id, {
      name: "Size: Medium / Color: Blue",
      sku: "TSHIRT-COTTON-M-BLU",
      inventoryQuantity: 40,
      reorderLevel: 10,
    });

    const freshProduct = repo.getProductById(ctx, product.id)!;
    expect(freshProduct.totalStock).toBe(65);
    expect(freshProduct.availableStock).toBe(65);
    expect(freshProduct.hasVariants).toBe(true);
    expect(freshProduct.variants?.length).toBe(2);
  });

  it("2. Variant pricing inheritance must fallback to parent default prices when inherit is true", () => {
    const product = repo.createProduct(ctx, {
      name: "Azam Juice 1L",
      sku: "AZM-JUC-1L",
      buyingPrice: 1200,
      sellingPrice: 1800,
    });

    const vInherit = repo.addVariant(ctx, product.id, {
      name: "Flavor: Mango",
      sku: "AZM-JUC-MNG",
      inheritBuyingPrice: true,
      inheritSellingPrice: true,
    });

    expect(vInherit.effectiveBuyingPrice).toBe(1200);
    expect(vInherit.effectiveSellingPrice).toBe(1800);

    const vOverride = repo.addVariant(ctx, product.id, {
      name: "Flavor: Special Passion Fruit",
      sku: "AZM-JUC-PSN",
      inheritBuyingPrice: false,
      inheritSellingPrice: false,
      costPrice: 1500,
      price: 2500,
    });

    expect(vOverride.effectiveBuyingPrice).toBe(1500);
    expect(vOverride.effectiveSellingPrice).toBe(2500);
  });

  it("3. Cartesian Variant Matrix Generator must generate all attribute combinations", () => {
    const attributes = [
      { name: "Size", values: ["S", "M", "L"] },
      { name: "Color", values: ["Black", "White"] },
    ];

    const generated = globalRetailEngine.generateVariantCombinations(
      "Polo Shirt",
      "POLO-SHIRT",
      attributes,
      10000,
      18000
    );

    expect(generated.length).toBe(6);
    expect(generated[0].name).toContain("Polo Shirt");
    expect(generated[0].sku).toContain("POLO-SHIRT-S-BLA");
    expect(generated[0].effectiveSellingPrice).toBe(18000);
  });

  it("4. Deleting a variant with stock ledger history soft-archives it instead of hard deletion", () => {
    const product = repo.createProduct(ctx, {
      name: "Kilimanjaro Water 500ml",
      sku: "KIL-WTR-500",
      buyingPrice: 400,
      sellingPrice: 600,
    });

    const variant = repo.addVariant(ctx, product.id, {
      name: "Pack: Single Bottle",
      sku: "KIL-WTR-SGL",
      inventoryQuantity: 50,
    });

    // Simulate stock ledger entry
    store.stockLedgers.set("led-001", {
      id: "led-001",
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId: product.id,
      variantId: variant.id,
      movementType: "OPENING",
      quantity: 50,
      referenceType: "INIT",
      occurredAt: new Date().toISOString(),
      deviceId: "DEV-01",
      operationId: "OP-01",
      idempotencyKey: "KEY-01",
      createdAt: new Date().toISOString(),
    });

    const deleted = repo.deleteVariant(ctx, variant.id);
    expect(deleted).toBe(true);

    const freshVariant = store.variants.get(variant.id);
    expect(freshVariant).toBeDefined();
    expect(freshVariant?.isActive).toBe(false);
  });
});
