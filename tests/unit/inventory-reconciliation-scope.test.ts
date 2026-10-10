import { describe, expect, it } from "vitest";
import type { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { reconcileLocalInventoryToOutbox } from "../../apps/web/src/services/inventoryReconciliationService.js";

const tenantA = "00000000-0000-0000-0000-000000000001";
const tenantB = "00000000-0000-0000-0000-000000000002";
const branchMain = "00000000-0000-0000-0000-000000000011";
const branchEast = "00000000-0000-0000-0000-000000000012";
const productId = "00000000-0000-0000-0000-000000000101";
const variantId = "00000000-0000-0000-0000-000000000201";

function product(scope: Record<string, unknown> = {}) {
  return {
    id: productId,
    name: "Scoped Test Item",
    sku: "SCOPE-001",
    category: "Test",
    buyingPrice: 50,
    sellingPrice: 100,
    status: "Active",
    ...scope,
  };
}

function variant(scope: Record<string, unknown> = {}) {
  return {
    id: variantId,
    productId,
    name: "Standard",
    sku: "SCOPE-001-STD",
    price: 100,
    costPrice: 50,
    stock: 0,
    inventoryQuantity: 0,
    isActive: true,
    ...scope,
  };
}

function makeDb(products: any[], variants: any[] = []) {
  const mutations: any[] = [];
  const db = {
    ready: Promise.resolve(),
    products: new Map(products.map((item) => [item.id, item])),
    productVariants: new Map(variants.map((item) => [item.id, item])),
    syncOutbox: new Map(),
    executeAtomicMutation: async (mutation: any) => {
      mutations.push(mutation);
      return { ok: true };
    },
  } as unknown as LocalIndexedDbStore;
  return { db, mutations };
}

describe("offline inventory reconciliation tenant/branch isolation", () => {
  it("requires explicit tenant and branch context", async () => {
    const { db, mutations } = makeDb([product({ tenantId: tenantA, branchId: branchMain })]);

    await expect(reconcileLocalInventoryToOutbox(db)).rejects.toThrow("SYNC_CONTEXT_REQUIRED");
    await expect(reconcileLocalInventoryToOutbox(db, tenantA)).rejects.toThrow("SYNC_CONTEXT_REQUIRED");
    expect(mutations).toHaveLength(0);
  });

  const invalidProductScopes: Array<[string, Record<string, unknown>]> = [
    ["another tenant", { tenantId: tenantB, branchId: branchMain }],
    ["another branch", { tenantId: tenantA, branchId: branchEast }],
    ["missing tenant", { branchId: branchMain }],
    ["missing branch", { tenantId: tenantA }],
    ["missing both scope fields", {}],
    ["another tenant with legacy snake_case fields", { tenant_id: tenantB, branch_id: branchMain }],
  ];

  for (const [label, scope] of invalidProductScopes) {
    it(`does not reconcile a product with ${label}`, async () => {
      const invalidProduct = product(scope);
      const { db, mutations } = makeDb([invalidProduct]);

      await expect(reconcileLocalInventoryToOutbox(db, tenantA, branchMain)).resolves.toBe(0);
      expect(mutations).toHaveLength(0);
      expect((invalidProduct as any).reconciledToOutbox).toBeUndefined();
    });
  }

  const invalidVariantScopes: Array<[string, Record<string, unknown>]> = [
    ["missing scope", {}],
    ["another tenant", { tenantId: tenantB, branchId: branchMain }],
    ["another branch", { tenantId: tenantA, branchId: branchEast }],
  ];

  for (const [label, scope] of invalidVariantScopes) {
    it(`does not reconcile a scoped product with a child variant from ${label}`, async () => {
      const parent = product({ tenantId: tenantA, branchId: branchMain });
      const child = variant(scope);
      const { db, mutations } = makeDb([parent], [child]);

      await expect(reconcileLocalInventoryToOutbox(db, tenantA, branchMain)).resolves.toBe(0);
      expect(mutations).toHaveLength(0);
      expect((parent as any).reconciledToOutbox).toBeUndefined();
    });
  }

  it("reconciles correctly scoped product and variant records into only the matching outbox scope", async () => {
    const parent = product({ tenant_id: tenantA, branch_id: branchMain });
    const child = variant({ tenantId: tenantA, branchId: branchMain });
    const { db, mutations } = makeDb([parent], [child]);

    await expect(reconcileLocalInventoryToOutbox(db, tenantA, branchMain)).resolves.toBe(1);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].tenantContext).toEqual({ tenantId: tenantA, branchId: branchMain });
    expect(mutations[0].outboxItems.length).toBeGreaterThan(0);
    expect(mutations[0].outboxItems.every((item: any) => item.tenantId === tenantA && item.branchId === branchMain)).toBe(true);
    expect((parent as any).reconciledToOutbox).toBe(true);
  });
});
