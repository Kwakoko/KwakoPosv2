import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { ProductService } from "../../src/services/productService.js";
import { InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Catalog Brand Persistence & Product Service", () => {
  const store = new InMemoryStore();
  const productService = new ProductService(undefined, undefined, store);

  const ctx: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["ALL"],
  };

  it("creates a brand and persists products referencing brandId (camelCase)", () => {
    const brand = productService.createBrand(ctx, {
      name: "Kwako Premium Brands",
      code: "KPB",
      description: "Flagship internal brand",
    });
    expect(brand.id).toBeDefined();

    const product = productService.createProduct(ctx, {
      name: "Premium Sunflower Oil 5L",
      sku: "OIL-5L-SUN",
      category: "Edibles",
      brandId: brand.id,
      variants: [
        {
          name: "5L Can",
          sku: "OIL-5L-CAN",
          price: 32000,
          costPrice: 24000,
        },
      ],
    });

    expect(product.id).toBeDefined();
    expect(product.brandId).toBe(brand.id);
    expect(product.brand_id).toBe(brand.id);

    const fetched = productService.getProductById(ctx, product.id);
    expect(fetched?.brandId).toBe(brand.id);
    expect(fetched?.brand_id).toBe(brand.id);
  });

  it("persists products referencing brand_id (snake_case fallback) seamlessly", () => {
    const brand = productService.createBrand(ctx, {
      name: "AfriFoods Export",
      code: "AFE",
    });

    const product = productService.createProduct(ctx, {
      name: "Organic Basmati Rice 25kg",
      sku: "RICE-25KG-BAS",
      category: "Grains",
      brand_id: brand.id,
      variants: [
        {
          name: "25kg Sack",
          sku: "RICE-25KG-SCK",
          price: 75000,
          costPrice: 58000,
        },
      ],
    });

    expect(product.id).toBeDefined();
    expect(product.brandId).toBe(brand.id);
    expect(product.brand_id).toBe(brand.id);

    const filtered = productService.getProducts(ctx, { brand_id: brand.id });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(product.id);
  });

  it("prevents cross-tenant brand assignment breaches", () => {
    const tenantB: TenantContext = {
      tenantId: randomUUID(),
      branchId: randomUUID(),
      userId: randomUUID(),
      roles: ["ADMIN"],
      permissions: ["ALL"],
    };

    const brandA = productService.createBrand(ctx, {
      name: "Tenant A Exclusive Brand",
      code: "TA-EXC",
    });

    expect(() =>
      productService.createProduct(tenantB, {
        name: "Contraband Product",
        sku: "CB-01",
        brandId: brandA.id,
      })
    ).toThrow(/Cross-tenant brand breach/);
  });
});
