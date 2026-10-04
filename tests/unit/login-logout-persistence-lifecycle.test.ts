import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  LocalIndexedDbStore,
  AUTHORITATIVE_SCHEMA_VERSION,
} from "../../apps/web/src/indexedDb.js";
import { buildServer } from "../../apps/api/src/server.js";
import { globalInMemoryStore } from "@kwakopos2/database";
import type { FastifyInstance } from "fastify";
import type { Product, ProductVariant, Sale, StockLedger } from "@kwakopos2/contracts";

describe("Login-Logout-Login Data Persistence Lifecycle Suite", () => {
  let server: FastifyInstance;
  let testDbName: string;
  let db: LocalIndexedDbStore;

  beforeEach(async () => {
    globalInMemoryStore.clear();
    testDbName = `kwakopos-lifecycle-${Math.random().toString(36).slice(2, 9)}`;
    db = new LocalIndexedDbStore(AUTHORITATIVE_SCHEMA_VERSION, testDbName);
    await db.ready;

    server = buildServer();
    await server.ready();
  });

  afterEach(async () => {
    if (db) db.close();
    if (server) await server.close();
  });

  it("Guarantees that re-login with the same email returns stable tenantId, branchId, and userId", async () => {
    // 1. Initial Login
    const login1 = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@retailstore.com", password: "Password123!" },
    });
    expect(login1.statusCode).toBe(200);
    const body1 = login1.json();
    expect(body1.success).toBe(true);
    const { user: user1 } = body1.data;
    expect(user1.email).toBe("owner@retailstore.com");
    expect(user1.tenantId).toBeDefined();
    expect(user1.branchId).toBeDefined();
    expect(user1.id).toBeDefined();

    // 2. Second Login with identical credentials
    const login2 = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "owner@retailstore.com", password: "Password123!" },
    });
    expect(login2.statusCode).toBe(200);
    const body2 = login2.json();
    const { user: user2 } = body2.data;

    // Critical assertion: tenantId, branchId, and userId MUST be strictly identical
    expect(user2.tenantId).toBe(user1.tenantId);
    expect(user2.branchId).toBe(user1.branchId);
    expect(user2.id).toBe(user1.id);
  });

  it("Preserves all catalog, inventory, and sales data across logout and re-login cycle", async () => {
    // 1. User logs in
    const loginRes = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "merchant@duka.co.tz", password: "SecurePass2026!" },
    });
    expect(loginRes.statusCode).toBe(200);
    const { user } = loginRes.json().data;
    const { tenantId, branchId, id: userId } = user;

    // 2. User creates products and variants in local store
    const product: Product = {
      id: "prod-life-001",
      name: "Chai Tea Leaves 500g",
      sku: "TEA-CHAI-500",
      description: "Premium Tanzanian black tea",
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveProductLocal(product);

    const variant: ProductVariant = {
      id: "var-life-001",
      productId: "prod-life-001",
      name: "500g Packet",
      sku: "TEA-CHAI-500-PKT",
      price: 4500,
      costPrice: 2800,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveVariantLocal(variant);

    // 3. User configures categories and brands (stored in configuration store)
    db.saveCatalogCategoriesLocal(
      [
        { id: "cat-001", name: "Beverages", code: "BEV", tenantId },
        { id: "cat-002", name: "Spices", code: "SPC", tenantId },
      ],
      { tenantId }
    );
    db.saveCatalogBrandsLocal(
      [
        { id: "br-001", name: "Kilimanjaro Blends", code: "KIL", tenantId },
      ],
      { tenantId }
    );

    // 4. User records stock movement & sale
    const movement: StockLedger = {
      id: "mov-001",
      tenantId,
      branchId,
      variantId: variant.id,
      quantityDelta: 100,
      runningBalance: 100,
      movementType: "OPENING_BALANCE",
      referenceType: "INITIAL_STOCK",
      referenceId: "init-01",
      performedBy: userId,
      createdAt: new Date().toISOString(),
    };
    db.saveStockLedgerLocal(movement);

    const sale: Sale = {
      id: "sale-life-001",
      tenantId,
      branchId,
      userId,
      subtotal: 9000,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 9000,
      status: "COMPLETED",
      items: [
        {
          id: "item-001",
          saleId: "sale-life-001",
          variantId: variant.id,
          productName: product.name,
          quantity: 2,
          unitPrice: 4500,
          subtotal: 9000,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveSaleLocal(sale);

    // 5. User queues an outbox mutation for background sync
    db.enqueueOutbox({
      entityType: "Sale",
      operationType: "CREATE",
      recordId: sale.id,
      tenantId,
      branchId,
      payload: sale,
    });

    // Verify in-memory state before logout
    expect(db.getProductsLocal(tenantId)).toHaveLength(1);
    expect(db.getSalesLocal(tenantId)).toHaveLength(1);
    expect(db.getConfigurationLocal("inventory_categories_meta", { tenantId })).toHaveLength(2);
    expect(db.getConfigurationLocal("inventory_brands_meta", { tenantId })).toHaveLength(1);
    expect(await db.getPendingOutboxCount(tenantId)).toBe(1);

    // 6. User LOGS OUT
    // Crucial step: logout flushes persistence before session destruction
    await db.flushPersistence();

    // Simulate browser closing / tab restart / user unmounting provider:
    db.close();

    // 7. USER LOGS BACK IN
    // New app lifecycle: user signs in again with same credentials
    const reLoginRes = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "merchant@duka.co.tz", password: "SecurePass2026!" },
    });
    expect(reLoginRes.statusCode).toBe(200);
    const reUser = reLoginRes.json().data.user;

    // Verify tenantId returned is IDENTICAL to previous session
    expect(reUser.tenantId).toBe(tenantId);
    expect(reUser.branchId).toBe(branchId);

    // 8. Re-open IndexedDB store for this client
    const freshDb = new LocalIndexedDbStore(AUTHORITATIVE_SCHEMA_VERSION, testDbName);
    await freshDb.ready;

    // 9. Verify ALL data is fully restored and accessible using reUser.tenantId
    const restoredProducts = freshDb.getProductsLocal(reUser.tenantId);
    expect(restoredProducts).toHaveLength(1);
    expect(restoredProducts[0].name).toBe("Chai Tea Leaves 500g");

    const restoredVariants = freshDb.getProductVariantsLocal(reUser.tenantId);
    expect(restoredVariants).toHaveLength(1);
    expect(restoredVariants[0].price).toBe(4500);

    const restoredCategories = freshDb.getConfigurationLocal("inventory_categories_meta", { tenantId: reUser.tenantId });
    expect(restoredCategories).toHaveLength(2);
    expect(restoredCategories.map((c: any) => c.name)).toEqual(["Beverages", "Spices"]);

    const restoredBrands = freshDb.getConfigurationLocal("inventory_brands_meta", { tenantId: reUser.tenantId });
    expect(restoredBrands).toHaveLength(1);
    expect(restoredBrands[0].name).toBe("Kilimanjaro Blends");

    const restoredSales = freshDb.getSalesLocal(reUser.tenantId);
    expect(restoredSales).toHaveLength(1);
    expect(restoredSales[0].grandTotal).toBe(9000);

    const restoredLedger = freshDb.getStockLedgerLocal(reUser.tenantId, branchId);
    expect(restoredLedger).toHaveLength(1);
    expect(restoredLedger[0].quantityDelta).toBe(100);

    const pendingOutbox = await freshDb.getPendingOutboxCount(reUser.tenantId);
    expect(pendingOutbox).toBe(1);

    freshDb.close();
  });

  it("Maintains strict data partition between two separate users logging into the same device", async () => {
    // User A Login
    const loginA = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "tenantA@business.com", password: "SecretA123!" },
    });
    const userA = loginA.json().data.user;

    // User A adds product
    db.saveProductLocal({
      id: "prod-A-01",
      name: "Tenant A Special",
      sku: "SKU-A",
      tenantId: userA.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Flush and logout User A
    await db.flushPersistence();

    // User B Login
    const loginB = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "tenantB@business.com", password: "SecretB123!" },
    });
    const userB = loginB.json().data.user;

    // Verify tenant identities are distinct
    expect(userB.tenantId).not.toBe(userA.tenantId);

    // User B queries products -> cannot see User A's products
    expect(db.getProductsLocal(userB.tenantId)).toHaveLength(0);

    // User B adds product
    db.saveProductLocal({
      id: "prod-B-01",
      name: "Tenant B Item",
      sku: "SKU-B",
      tenantId: userB.tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.flushPersistence();

    // Re-login User A
    const reLoginA = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "tenantA@business.com", password: "SecretA123!" },
    });
    const reUserA = reLoginA.json().data.user;
    expect(reUserA.tenantId).toBe(userA.tenantId);

    // User A sees only User A products
    const prodsA = db.getProductsLocal(reUserA.tenantId);
    expect(prodsA).toHaveLength(1);
    expect(prodsA[0].name).toBe("Tenant A Special");

    // User B products are isolated
    const prodsB = db.getProductsLocal(userB.tenantId);
    expect(prodsB).toHaveLength(1);
    expect(prodsB[0].name).toBe("Tenant B Item");
  });
});
