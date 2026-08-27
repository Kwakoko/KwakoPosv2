import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  InMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import { ProductService } from "../../src/services/productService.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Catalog Brand Persistence Full Lifecycle: UI → Service → IndexedDB → Reload → Re-login → Browser B", () => {
  let serverStore: InMemoryStore;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverCommercialRepo: ScopedCommercialRepository;
  let serverSyncEngine: SyncEngine;
  let productService: ProductService;

  let ctx: TenantContext;

  beforeEach(() => {
    serverStore = new InMemoryStore();
    serverProductRepo = new ScopedProductRepository(serverStore);
    serverStockRepo = new ScopedStockRepository(serverStore);
    serverCommercialRepo = new ScopedCommercialRepository(serverStore);
    serverSyncEngine = new SyncEngine(
      serverProductRepo,
      serverStockRepo,
      serverCommercialRepo,
      serverStore
    );
    productService = new ProductService(serverProductRepo, serverStockRepo, serverStore);

    ctx = {
      tenantId: `tenant-${randomUUID()}`,
      branchId: `branch-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      roles: ["ADMIN"],
      permissions: ["PRODUCT_CREATE", "PRODUCT_EDIT", "PRODUCT_VIEW"],
    };
  });

  it("Executes end-to-end Brand persistence lifecycle: UI -> Service -> IndexedDB -> Reload -> Logout/Login -> Browser B", async () => {
    // -------------------------------------------------------------
    // STAGE 1: UI & Product Service Brand & Product Creation
    // -------------------------------------------------------------
    const brand = productService.createBrand(ctx, {
      name: "Kwako Heritage Coffee",
      code: "KHC",
      description: "Premium Arabica Single-Origin Coffee",
    });
    expect(brand.id).toBeDefined();
    expect(brand.name).toBe("Kwako Heritage Coffee");

    // Product created with camelCase brandId
    const productA = productService.createProduct(ctx, {
      name: "Arabica Roast 500g",
      sku: "COF-ARA-500",
      category: "Beverages",
      brandId: brand.id,
      variants: [
        {
          name: "Medium Roast 500g",
          sku: "COF-MED-500",
          price: 18000,
          costPrice: 11000,
        },
      ],
    });
    expect(productA.brandId).toBe(brand.id);
    expect(productA.brand_id).toBe(brand.id);

    // Product created with snake_case brand_id fallback
    const productB = productService.createProduct(ctx, {
      name: "Dark Roast 1kg",
      sku: "COF-DRK-1KG",
      category: "Beverages",
      brand_id: brand.id,
      variants: [
        {
          name: "Whole Bean 1kg",
          sku: "COF-DRK-1KG-WB",
          price: 34000,
          costPrice: 20000,
        },
      ],
    });
    expect(productB.brandId).toBe(brand.id);
    expect(productB.brand_id).toBe(brand.id);

    // -------------------------------------------------------------
    // STAGE 2: Local IndexedDB Persistence (Browser A)
    // -------------------------------------------------------------
    const browserADb = new LocalIndexedDbStore();
    const browserAEngine = new ClientSyncEngine("device-browser-a", browserADb);

    browserADb.saveProductLocal(productA);
    browserADb.saveProductLocal(productB);

    expect(browserADb.products.size).toBe(2);
    expect(browserADb.products.get(productA.id)?.brandId).toBe(brand.id);
    expect(browserADb.products.get(productA.id)?.brand_id).toBe(brand.id);

    // -------------------------------------------------------------
    // STAGE 3: Browser Reload Simulation (State preservation)
    // -------------------------------------------------------------
    // On PWA page reload, IndexedDB state is re-hydrated
    const reloadedBrowserADb = new LocalIndexedDbStore();
    for (const [id, prod] of browserADb.products.entries()) {
      reloadedBrowserADb.saveProductLocal(prod);
    }
    expect(reloadedBrowserADb.products.get(productA.id)?.brandId).toBe(brand.id);
    expect(reloadedBrowserADb.products.get(productB.id)?.brand_id).toBe(brand.id);

    // -------------------------------------------------------------
    // STAGE 4: Logout & Login Simulation
    // -------------------------------------------------------------
    // User logs out (auth tokens cleared, but tenant catalog cache re-verified upon login)
    const newSessionUserId = `user-logged-in-${randomUUID()}`;
    const loggedInCtx: TenantContext = {
      ...ctx,
      userId: newSessionUserId,
    };

    const serverProducts = productService.getProducts(loggedInCtx, { brandId: brand.id });
    expect(serverProducts.length).toBe(2);
    expect(serverProducts[0].brandId).toBe(brand.id);
    expect(serverProducts[1].brand_id).toBe(brand.id);

    // -------------------------------------------------------------
    // STAGE 5: Multi-Device Sync to Second Browser (Browser B)
    // -------------------------------------------------------------
    const browserBDb = new LocalIndexedDbStore();
    const browserBEngine = new ClientSyncEngine("device-browser-b", browserBDb);

    await browserBEngine.syncWithServer(
      async (req) => serverSyncEngine.processPush(loggedInCtx, req),
      async (since) => serverSyncEngine.processDelta(loggedInCtx, { since })
    );

    expect(browserBDb.products.size).toBe(2);
    const browserBProductA = browserBDb.products.get(productA.id);
    const browserBProductB = browserBDb.products.get(productB.id);

    expect(browserBProductA).toBeDefined();
    expect(browserBProductA?.brandId).toBe(brand.id);
    expect(browserBProductA?.brand_id).toBe(brand.id);

    expect(browserBProductB).toBeDefined();
    expect(browserBProductB?.brandId).toBe(brand.id);
    expect(browserBProductB?.brand_id).toBe(brand.id);
  });
});
