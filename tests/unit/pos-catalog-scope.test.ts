import { describe, expect, it } from "vitest";
import { filterPosCatalogToScope, filterRecordsToTenantBranchScope } from "../../apps/web/src/services/posCatalogScope.js";

describe("POS catalog tenant and branch scope", () => {
  const products = [
    { id: "p-main", tenantId: "tenant-a", branchId: "branch-main", name: "Main store item" },
    { id: "p-other-branch", tenantId: "tenant-a", branchId: "branch-east", name: "East item" },
    { id: "p-other-tenant", tenantId: "tenant-b", branchId: "branch-main", name: "Foreign tenant item" },
    { id: "p-missing-scope", name: "Unscoped legacy item" },
  ];
  const variants = [
    { id: "v-valid", productId: "p-main", tenantId: "tenant-a", branchId: "branch-main", name: "Valid variant" },
    { id: "v-other-branch", productId: "p-main", tenantId: "tenant-a", branchId: "branch-east", name: "Foreign branch variant" },
    { id: "v-other-tenant", productId: "p-main", tenantId: "tenant-b", branchId: "branch-main", name: "Foreign tenant variant" },
    { id: "v-unscoped", productId: "p-main", name: "Unscoped variant" },
    { id: "v-orphan", productId: "p-other-tenant", tenantId: "tenant-a", branchId: "branch-main", name: "Foreign parent variant" },
  ];

  it("returns only products and variants belonging to the exact active tenant and branch", () => {
    const result = filterPosCatalogToScope(products, variants, "tenant-a", "branch-main");

    expect(result.products.map((product) => product.id)).toEqual(["p-main"]);
    expect(result.variants.map((variant) => variant.id)).toEqual(["v-valid"]);
  });

  it("fails closed when tenant or branch context is missing", () => {
    expect(filterPosCatalogToScope(products, variants, undefined, "branch-main")).toEqual({
      products: [],
      variants: [],
    });
    expect(filterPosCatalogToScope(products, variants, "tenant-a", null)).toEqual({
      products: [],
      variants: [],
    });
  });

  it("keeps valid products that have no variants but excludes variants whose parent product is out of scope", () => {
    const result = filterPosCatalogToScope(
      [...products, { id: "p-no-variants", tenantId: "tenant-a", branchId: "branch-main", name: "Simple item" }],
      variants,
      "tenant-a",
      "branch-main",
    );

    expect(result.products.map((product) => product.id)).toEqual(["p-main", "p-no-variants"]);
    expect(result.variants.every((variant) => result.products.some((product) => product.id === variant.productId))).toBe(true);
  });

  it("scopes customer and product search records and supports normalized legacy scope fields", () => {
    const records = [
      { id: "customer-a", tenantId: "tenant-a", branchId: "branch-main", name: "Visible customer" },
      { id: "customer-b", tenantId: "tenant-b", branchId: "branch-main", name: "Foreign customer" },
      { id: "customer-east", tenant_id: "tenant-a", branch_id: "branch-east", name: "Other branch customer" },
      { id: "customer-unscoped", name: "Unscoped customer" },
    ];

    expect(filterRecordsToTenantBranchScope(records, "tenant-a", "branch-main").map((record) => record.id))
      .toEqual(["customer-a"]);
    expect(filterRecordsToTenantBranchScope(records, undefined, "branch-main")).toEqual([]);
  });
});
