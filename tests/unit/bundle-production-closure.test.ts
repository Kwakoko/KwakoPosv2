import { describe, expect, it } from "vitest";
import { resolveBundleDefinition } from "../../packages/database/src/bundleInventory.ts";
import {
  expandBundleSaleItems,
  getBundleAvailableQuantity,
  type PosSaleStockItem,
} from "../../apps/web/src/services/inventoryStockService.ts";

function variant(id: string, productId: string, costPrice: number, attributes: any = {}) {
  return {
    id,
    tenantId: "tenant-1",
    branchId: "branch-1",
    productId,
    costPrice,
    price: 10,
    isActive: true,
    attributes,
    updatedAt: new Date("2026-10-08T00:00:00.000Z"),
  };
}

describe("bundle production invariants", () => {
  it("computes sellable bundle quantity as the minimum component capacity", () => {
    const db: any = {
      productVariants: new Map([
        ["bundle", variant("bundle", "bundle-product", 0, { __bundle: true, bundleComponents: [
          { variantId: "a", quantity: 2 },
          { variantId: "b", quantity: 3 },
        ] })],
        ["a", variant("a", "product-a", 4)],
        ["b", variant("b", "product-b", 2)],
      ]),
      stockLedger: new Map([
        ["a-open", { tenantId: "tenant-1", branchId: "branch-1", variantId: "a", quantityChange: 10 }],
        ["b-open", { tenantId: "tenant-1", branchId: "branch-1", variantId: "b", quantityChange: 8 }],
      ]),
      products: new Map([
        ["product-a", { id: "product-a", tenantId: "tenant-1", branchId: "branch-1", name: "A" }],
        ["product-b", { id: "product-b", tenantId: "tenant-1", branchId: "branch-1", name: "B" }],
      ]),
    };

    expect(getBundleAvailableQuantity(db, "bundle", "tenant-1", "branch-1")).toBe(2);
    expect((await resolveBundleDefinition({
      productVariant: { findUnique: async ({ where }: any) => db.productVariants.get(where.id) || null },
    }, "tenant-1", "branch-1", "bundle")).unitCost).toBe(14);
    const expanded = expandBundleSaleItems(db, [
      { productId: "bundle-product", variantId: "bundle", qty: 2, unitCost: 0 } satisfies PosSaleStockItem,
    ], "tenant-1", "branch-1");
    expect(expanded).toEqual(expect.arrayContaining([
      expect.objectContaining({ variantId: "a", qty: 4 }),
      expect.objectContaining({ variantId: "b", qty: 6 }),
    ]));
  });

  it("rejects nested bundles in the authoritative resolver", async () => {
    const variants = new Map<string, any>([
      ["bundle", variant("bundle", "bundle-product", 0, { __bundle: true, bundleComponents: [{ variantId: "nested", quantity: 1 }] })],
      ["nested", variant("nested", "nested-product", 0, { __bundle: true, bundleComponents: [{ variantId: "leaf", quantity: 1 }] })],
      ["leaf", variant("leaf", "leaf-product", 2)],
    ]);
    const tx = { productVariant: { findUnique: async ({ where }: any) => variants.get(where.id) || null } };

    await expect(resolveBundleDefinition(tx, "tenant-1", "branch-1", "bundle"))
      .rejects.toThrow("BUNDLE_NESTING_NOT_SUPPORTED");
  });

  it("rejects self-reference and component scope violations", async () => {
    const variants = new Map<string, any>([
      ["bundle", variant("bundle", "bundle-product", 0, { __bundle: true, bundleComponents: [{ variantId: "bundle", quantity: 1 }] })],
    ]);
    const tx = { productVariant: { findUnique: async ({ where }: any) => variants.get(where.id) || null } };
    await expect(resolveBundleDefinition(tx, "tenant-1", "branch-1", "bundle"))
      .rejects.toThrow("BUNDLE_SELF_REFERENCE");
  });
});


  it("rejects a component that crosses tenant or branch scope", async () => {
    const variants = new Map<string, any>([
      ["bundle", variant("bundle", "bundle-product", 0, { __bundle: true, bundleComponents: [{ variantId: "foreign", quantity: 1 }] })],
      ["foreign", { ...variant("foreign", "foreign-product", 2), tenantId: "tenant-2" }],
    ]);
    const tx = { productVariant: { findUnique: async ({ where }: any) => variants.get(where.id) || null } };
    await expect(resolveBundleDefinition(tx, "tenant-1", "branch-1", "bundle"))
      .rejects.toThrow("BUNDLE_COMPONENT_OUT_OF_SCOPE");
  });
