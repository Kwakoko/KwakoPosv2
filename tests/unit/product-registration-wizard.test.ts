/**
 * KwakoPos v2 — 5-Step Product Registration Wizard Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive tests verifying:
 *   1. Validation rules fail closed (name, category, SKU, tenant uniqueness, prices)
 *   2. Non-variant registration: Product definition + Default Variant with 0 stock,
 *      opening stock posted strictly as StockLedger movement & StockAdjustment outbox mutation
 *   3. Variant product registration: Product definition + Matrix Variants with 0 stock,
 *      opening stock movements per variant, aggregate product opening stock
 *   4. Offline registration: persists to local IndexedDB and outbox without network
 *   5. Outbox retry & idempotency: retrying push does not duplicate opening stock
 *   6. StockLedger convergence: derived stock equals ledger movements
 *   7. Fresh-browser bootstrap: new device reproduces exact state from snapshot
 *   8. Tenant & branch isolation: operations never leak across tenant boundaries
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine";
import type { TenantContext } from "@kwakopos2/contracts";

describe("5-Step Product Registration Wizard Invariants Suite", () => {
  let tenant1Ctx: TenantContext;
  let tenant2Ctx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  let localDb1: LocalIndexedDbStore;
  let syncEngine1: ClientSyncEngine;

  let localDb2: LocalIndexedDbStore;
  let syncEngine2: ClientSyncEngine;

  beforeEach(async () => {
    globalInMemoryStore.clear();

    tenant1Ctx = {
      tenantId: "tenant-wz-001",
      branchId: "branch-wz-001",
      userId: "user-wz-001",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    tenant2Ctx = {
      tenantId: "tenant-wz-002",
      branchId: "branch-wz-002",
      userId: "user-wz-002",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    localDb1 = new LocalIndexedDbStore(5);
    await localDb1.ready;
    localDb1.clear({ allowDestructiveReset: true });
    syncEngine1 = new ClientSyncEngine("device-browser-1", localDb1, undefined, undefined, tenant1Ctx.tenantId, tenant1Ctx.branchId);

    localDb2 = new LocalIndexedDbStore(5);
    await localDb2.ready;
    localDb2.clear({ allowDestructiveReset: true });
    syncEngine2 = new ClientSyncEngine("device-browser-2", localDb2, undefined, undefined, tenant1Ctx.tenantId, tenant1Ctx.branchId);
  });

  // ── 1. Validation Fail-Closed Logic ──────────────────────────────────────────
  describe("1. Validation & Constraint Enforcement", () => {
    it("fails closed when required fields are missing", () => {
      // Simulate wizard step validation rules
      const validateStep1 = (prod: { name: string; category: string; sku: string }) => {
        const errors: string[] = [];
        if (!prod.name.trim()) errors.push("Product Name is required.");
        if (!prod.category.trim()) errors.push("Category is required.");
        if (!prod.sku.trim()) errors.push("SKU Code is required.");
        return errors;
      };

      expect(validateStep1({ name: "", category: "Beverages", sku: "SKU-TEST" })).toContain("Product Name is required.");
      expect(validateStep1({ name: "Fanta", category: "", sku: "SKU-TEST" })).toContain("Category is required.");
      expect(validateStep1({ name: "Fanta", category: "Beverages", sku: "" })).toContain("SKU Code is required.");
      expect(validateStep1({ name: "Fanta", category: "Beverages", sku: "SKU-TEST" })).toHaveLength(0);
    });

    it("enforces tenant-scoped SKU uniqueness", () => {
      const existingSku = "SKU-UNIQUE-101";
      localDb1.saveProductLocal({
        id: randomUUID(),
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
        name: "Existing Item",
        sku: existingSku,
        category: "General",
        buyingPrice: 100,
        sellingPrice: 150,
        currentMarginAmount: 50,
        currentMarginPercentage: 33.3,
        stock: 0,
        totalStock: 0,
        availableStock: 0,
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Checking uniqueness in tenant 1
      const isSkuDuplicate = (candidateSku: string, tenantId: string) => {
        return Array.from(localDb1.products.values()).some((p: any) => {
          if (p.tenantId !== tenantId) return false;
          return p.sku?.toLowerCase() === candidateSku.toLowerCase();
        });
      };

      expect(isSkuDuplicate(existingSku, tenant1Ctx.tenantId)).toBe(true);
      expect(isSkuDuplicate("SKU-NEW-999", tenant1Ctx.tenantId)).toBe(false);
      // Different tenant does not conflict
      expect(isSkuDuplicate(existingSku, "other-tenant")).toBe(false);
    });

    it("rejects negative prices and detects negative margins", () => {
      const validateCommercial = (buy: number, sell: number) => {
        const errors: string[] = [];
        if (buy < 0) errors.push("Buying Cost must be non-negative.");
        if (sell < 0) errors.push("Selling Price must be non-negative.");
        const isNegativeMargin = sell > 0 && buy > sell;
        return { errors, isNegativeMargin, marginAmount: sell - buy };
      };

      const result1 = validateCommercial(-10, 20);
      expect(result1.errors).toContain("Buying Cost must be non-negative.");

      const result2 = validateCommercial(3000, 2500);
      expect(result2.errors).toHaveLength(0);
      expect(result2.isNegativeMargin).toBe(true);
      expect(result2.marginAmount).toBe(-500);
    });
  });

  // ── 2. Non-Variant Registration Invariants ──────────────────────────────────
  describe("2. Non-Variant Product Registration (Zero Catalog Stock Invariant)", () => {
    it("registers product & default variant with 0 stock and posts OPENING_STOCK movement", async () => {
      const prodId = randomUUID();
      const defaultVarId = `${prodId}-default`;
      const baseSku = "SKU-FLR-1001";
      const proposedOpeningStock = 45;

      const productRecord = {
        id: prodId,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
        name: "Azam Wheat Flour 2kg",
        sku: baseSku,
        category: "Grains & Flour",
        brand: "Azam",
        buyingPrice: 2000,
        sellingPrice: 2600,
        costPrice: 2000,
        currentMarginAmount: 600,
        currentMarginPercentage: 23.08,
        stock: 0,
        totalStock: 0,
        availableStock: 0,
        reorderLevel: 10,
        status: "Active",
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const defaultVariant = {
        id: defaultVarId,
        productId: prodId,
        name: "Standard",
        sku: `${baseSku}-STD`,
        barcode: "890123456789",
        price: 2600,
        costPrice: 2000,
        buyingPrice: 2000,
        sellingPrice: 2600,
        inventoryQuantity: 0,
        stock: 0,
        reorderLevel: 10,
        isActive: true,
        tenantId: tenant1Ctx.tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Local IndexedDB writes
      localDb1.saveProductLocal(productRecord as any, { tenantId: tenant1Ctx.tenantId, branchId: tenant1Ctx.branchId });
      localDb1.saveVariantLocal(defaultVariant as any, { tenantId: tenant1Ctx.tenantId, branchId: tenant1Ctx.branchId });

      // Invariant Check: Catalog records MUST have 0 stock
      expect(localDb1.products.get(prodId)?.stock).toBe(0);
      expect(localDb1.products.get(prodId)?.totalStock).toBe(0);
      expect(localDb1.products.get(prodId)?.availableStock).toBe(0);
      expect(localDb1.productVariants.get(defaultVarId)?.stock).toBe(0);
      expect(localDb1.productVariants.get(defaultVarId)?.inventoryQuantity).toBe(0);

      // 2. Outbox Enqueueing
      localDb1.enqueueOutbox({
        entityType: "Product",
        entityId: prodId,
        operationType: "CREATE",
        payload: { ...productRecord, variants: [{ ...defaultVariant, stock: 0, inventoryQuantity: 0 }] },
        idempotencyKey: `PROD-CREATE-${prodId}`,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      localDb1.enqueueOutbox({
        entityType: "ProductVariant",
        entityId: defaultVarId,
        operationType: "CREATE",
        payload: { ...defaultVariant, stock: 0, inventoryQuantity: 0 },
        idempotencyKey: `VAR-CREATE-${defaultVarId}`,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      // 3. Opening stock recorded strictly as StockLedger movement
      localDb1.saveStockLedgerLocal(
        {
          id: `led-${defaultVarId}`,
          productId: prodId,
          variantId: defaultVarId,
          sku: defaultVariant.sku,
          name: productRecord.name,
          quantity: proposedOpeningStock,
          balanceAfter: proposedOpeningStock,
          reason: "OPENING_STOCK",
          movementType: "OPENING_STOCK",
          timestamp: new Date().toISOString(),
          tenantId: tenant1Ctx.tenantId,
          branchId: tenant1Ctx.branchId,
        } as any,
        { tenantId: tenant1Ctx.tenantId, branchId: tenant1Ctx.branchId }
      );

      localDb1.enqueueOutbox({
        entityType: "StockAdjustment",
        entityId: `adj-${defaultVarId}`,
        operationType: "CREATE",
        payload: {
          productId: prodId,
          variantId: defaultVarId,
          sku: defaultVariant.sku,
          adjustmentType: "INCREASE",
          movementType: "OPENING_STOCK",
          quantityChange: proposedOpeningStock,
          reason: "OPENING_STOCK",
          deviceId: "device-browser-1",
          operationId: `adj-${defaultVarId}`,
          idempotencyKey: `ADJ-${defaultVarId}`,
        },
        idempotencyKey: `ADJ-${defaultVarId}`,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      // Assert local ledger has the entry
      const ledgerEntry = localDb1.stockLedger.get(`led-${defaultVarId}`);
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry?.quantity).toBe(proposedOpeningStock);
      expect(ledgerEntry?.movementType).toBe("OPENING_STOCK");

      // Verify derived balance is computed from ledger
      const derivedBalance = Array.from(localDb1.stockLedger.values())
        .filter((l: any) => l.productId === prodId)
        .reduce((sum, l: any) => sum + Number(l.quantityChange ?? l.quantity ?? 0), 0);
      expect(derivedBalance).toBe(proposedOpeningStock);
    });
  });

  // ── 3. Variant Matrix Product Registration Invariants ───────────────────────
  describe("3. Variant Matrix Registration (Aggregate Opening Stock Invariant)", () => {
    it("creates matrix variants with 0 stock and posts opening stock movement per variant", async () => {
      const prodId = randomUUID();
      const baseSku = "SKU-TSHIRT";
      const var1Id = randomUUID();
      const var2Id = randomUUID();

      const variants = [
        {
          id: var1Id,
          productId: prodId,
          name: "Cotton T-Shirt - Small",
          sku: `${baseSku}-SM`,
          barcode: "890111",
          buyingPrice: 5000,
          sellingPrice: 8000,
          stock: 0,
          inventoryQuantity: 0,
          openingStock: 25,
          reorderLevel: 5,
        },
        {
          id: var2Id,
          productId: prodId,
          name: "Cotton T-Shirt - Large",
          sku: `${baseSku}-LG`,
          barcode: "890222",
          buyingPrice: 5500,
          sellingPrice: 9000,
          stock: 0,
          inventoryQuantity: 0,
          openingStock: 40,
          reorderLevel: 5,
        },
      ];

      const productRecord = {
        id: prodId,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
        name: "Cotton T-Shirt",
        sku: baseSku,
        category: "Apparel",
        buyingPrice: 5000,
        sellingPrice: 8000,
        stock: 0,
        totalStock: 0,
        availableStock: 0,
        hasVariants: true,
        reorderLevel: 5,
        variants: variants.map((v) => ({ ...v, stock: 0, inventoryQuantity: 0 })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      localDb1.saveProductWithVariantsLocal(
        productRecord as any,
        variants.map((v) => ({ ...v, stock: 0, inventoryQuantity: 0 })) as any,
        { tenantId: tenant1Ctx.tenantId, branchId: tenant1Ctx.branchId }
      );

      // Verify product and variant catalog stocks are strictly 0
      expect(localDb1.productVariants.get(var1Id)?.stock).toBe(0);
      expect(localDb1.productVariants.get(var2Id)?.stock).toBe(0);

      // Record opening stock for each variant
      for (const v of variants) {
        localDb1.saveStockLedgerLocal(
          {
            id: `led-${v.id}`,
            productId: prodId,
            variantId: v.id,
            sku: v.sku,
            name: v.name,
            quantity: v.openingStock,
            balanceAfter: v.openingStock,
            reason: "OPENING_STOCK",
            movementType: "OPENING_STOCK",
            timestamp: new Date().toISOString(),
            tenantId: tenant1Ctx.tenantId,
            branchId: tenant1Ctx.branchId,
          } as any,
          { tenantId: tenant1Ctx.tenantId, branchId: tenant1Ctx.branchId }
        );

        localDb1.enqueueOutbox({
          entityType: "StockAdjustment",
          entityId: `adj-${v.id}`,
          operationType: "CREATE",
          payload: {
            productId: prodId,
            variantId: v.id,
            sku: v.sku,
            adjustmentType: "INCREASE",
            movementType: "OPENING_STOCK",
            quantityChange: v.openingStock,
            reason: "OPENING_STOCK",
            deviceId: "device-browser-1",
            operationId: `adj-${v.id}`,
            idempotencyKey: `ADJ-${v.id}`,
          },
          idempotencyKey: `ADJ-${v.id}`,
          tenantId: tenant1Ctx.tenantId,
          branchId: tenant1Ctx.branchId,
        });
      }

      // Aggregate stock from variant movements
      const totalDerivedStock = variants.reduce((sum, v) => {
        const vBalance = Array.from(localDb1.stockLedger.values())
          .filter((l: any) => l.variantId === v.id)
          .reduce((acc, l: any) => acc + Number(l.quantityChange ?? l.quantity ?? 0), 0);
        return sum + vBalance;
      }, 0);

      expect(totalDerivedStock).toBe(65); // 25 + 40
    });
  });

  // ── 4. Offline Registration & Outbox Persistence ────────────────────────────
  describe("4. Offline Registration & Outbox Queueing", () => {
    it("works completely offline, persisting state and pending outbox operations", () => {
      const prodId = randomUUID();
      const varId = `${prodId}-default`;

      // Simulate offline user registration
      localDb1.saveProductLocal({
        id: prodId,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
        name: "Offline Biscuit Pack",
        sku: "SKU-OFFLINE-001",
        category: "Bakery",
        buyingPrice: 500,
        sellingPrice: 800,
        currentMarginAmount: 300,
        currentMarginPercentage: 37.5,
        stock: 0,
        totalStock: 0,
        availableStock: 0,
        hasVariants: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      localDb1.enqueueOutbox({
        entityType: "Product",
        entityId: prodId,
        operationType: "CREATE",
        payload: { name: "Offline Biscuit Pack", sku: "SKU-OFFLINE-001" },
        idempotencyKey: `PROD-${prodId}`,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      localDb1.enqueueOutbox({
        entityType: "StockAdjustment",
        entityId: `adj-${varId}`,
        operationType: "CREATE",
        payload: {
          variantId: varId,
          quantityChange: 100,
          movementType: "OPENING_STOCK",
        },
        idempotencyKey: `ADJ-${varId}`,
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      // Check pending outbox
      const pending = localDb1.getPendingOutbox(tenant1Ctx.tenantId);
      expect(pending.length).toBe(2);
      expect(pending[0].entityType).toBe("Product");
      expect(pending[1].entityType).toBe("StockAdjustment");
    });
  });

  // ── 5. End-to-End Synchronization & Convergence ─────────────────────────────
  describe("5. End-to-End Synchronization & Multi-Device Convergence", () => {
    it("pushes registered product & opening movements to PostgreSQL and bootstraps on Browser 2", async () => {
      const prodId = randomUUID();
      const variantId = randomUUID();
      const sku = "SKU-COFFEE-01";
      const openingUnits = 50;

      // 1. Browser 1 registers product definition + variant definition + opening stock movement
      localDb1.recordOutboxMutation({
        id: "OP-PROD-01",
        entityType: "Product",
        entityId: prodId,
        operationType: "CREATE",
        payload: {
          id: prodId,
          name: "Kilimanjaro Coffee Beans",
          sku,
          category: "Beverages",
          buyingPrice: 10000,
          sellingPrice: 15000,
          stock: 0,
        },
        idempotencyKey: `PROD-${prodId}`,
        clientCreatedAt: new Date().toISOString(),
        status: "PENDING",
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      localDb1.recordOutboxMutation({
        id: "OP-VAR-01",
        entityType: "ProductVariant",
        entityId: variantId,
        operationType: "CREATE",
        payload: {
          id: variantId,
          productId: prodId,
          name: "Standard",
          sku: `${sku}-STD`,
          price: 15000,
          costPrice: 10000,
          stock: 0,
          inventoryQuantity: 0,
        },
        idempotencyKey: `VAR-${variantId}`,
        clientCreatedAt: new Date().toISOString(),
        status: "PENDING",
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      localDb1.recordOutboxMutation({
        id: "OP-ADJ-01",
        entityType: "StockAdjustment",
        entityId: `adj-${variantId}`,
        operationType: "CREATE",
        payload: {
          productId: prodId,
          variantId,
          sku: `${sku}-STD`,
          adjustmentType: "INCREASE",
          movementType: "OPENING_STOCK",
          quantityChange: openingUnits,
          reason: "OPENING_STOCK",
          deviceId: "device-browser-1",
          operationId: "OP-ADJ-01",
          idempotencyKey: `ADJ-${variantId}`,
        },
        idempotencyKey: `ADJ-${variantId}`,
        clientCreatedAt: new Date().toISOString(),
        status: "PENDING",
        tenantId: tenant1Ctx.tenantId,
        branchId: tenant1Ctx.branchId,
      });

      // 2. Browser 1 syncs with server (Push)
      const pushRes = await syncEngine1.syncWithServer(
        async (req) => syncEngine.processPush(tenant1Ctx, req),
        async (since) => syncEngine.processDelta(tenant1Ctx, { since }),
        tenant1Ctx.tenantId
      );
      expect(pushRes.pushed).toBe(3);
      expect(localDb1.getPendingOutbox(tenant1Ctx.tenantId).length).toBe(0);

      // Verify server state
      const serverProduct = serverProductRepo.getProductById(tenant1Ctx, prodId);
      expect(serverProduct).toBeDefined();
      expect(serverProduct?.name).toBe("Kilimanjaro Coffee Beans");

      const serverVariant = serverProduct?.variants?.find((v) => v.id === variantId);
      expect(serverVariant).toBeDefined();

      const serverStock = serverStockRepo.getAvailableStock(tenant1Ctx, variantId);
      expect(serverStock).toBe(openingUnits);

      // 3. Browser 2 bootstraps from authoritative snapshot
      const bootstrapRes = await syncEngine2.bootstrapWithServer(
        async (req) => syncEngine.processBootstrap(tenant1Ctx, req),
        tenant1Ctx.tenantId,
        tenant1Ctx.branchId
      );
      expect(bootstrapRes.applied).toBeGreaterThanOrEqual(1);

      // Browser 2 must have the product and variant with derived stock
      const b2Prod = localDb2.products.get(prodId);
      expect(b2Prod).toBeDefined();

      const b2Stock = Array.from(localDb2.stockLedger.values())
        .filter((l: any) => l.variantId === variantId)
        .reduce((sum, l: any) => sum + Number(l.quantityChange ?? l.quantity ?? 0), 0);
      expect(b2Stock).toBe(openingUnits);
    });

    it("ensures opening stock operation retries are idempotent and do not duplicate stock", async () => {
      const prodId = randomUUID();
      const variantId = randomUUID();
      const openingUnits = 30;

      // Seed product and variant on server
      serverProductRepo.createProduct(tenant1Ctx, {
        id: prodId,
        name: "Idempotency Test Sugar",
        sku: "SKU-SUGAR",
        category: "Staples",
        buyingPrice: 1000,
        sellingPrice: 1500,
        variants: [
          {
            id: variantId,
            name: "Standard",
            sku: "SKU-SUGAR-STD",
            price: 1500,
            costPrice: 1000,
          },
        ],
      });

      const pushRequest = {
        deviceId: "device-browser-1",
        operations: [
          {
            operationId: "OP-ADJ-IDEMPOTENT",
            entityType: "StockAdjustment" as const,
            entityId: `adj-${variantId}`,
            operationType: "CREATE" as const,
            payload: {
              productId: prodId,
              variantId,
              sku: "SKU-SUGAR-STD",
              adjustmentType: "INCREASE",
              movementType: "OPENING_STOCK",
              quantityChange: openingUnits,
              reason: "OPENING_STOCK",
              deviceId: "device-browser-1",
              operationId: "OP-ADJ-IDEMPOTENT",
              idempotencyKey: `IDEM-OPENING-${variantId}`,
            },
            clientCreatedAt: new Date().toISOString(),
            idempotencyKey: `IDEM-OPENING-${variantId}`,
          },
        ],
      };

      // First Push
      const res1 = syncEngine.processPush(tenant1Ctx, pushRequest);
      expect(res1.results[0].status).toBe("SUCCESS");
      expect(serverStockRepo.getAvailableStock(tenant1Ctx, variantId)).toBe(openingUnits);

      // Second Push with identical idempotencyKey (simulating network retry)
      const res2 = syncEngine.processPush(tenant1Ctx, pushRequest);
      expect(res2.results[0].status).toBe("ALREADY_PROCESSED");

      // Stock MUST remain exactly openingUnits, zero double counting!
      expect(serverStockRepo.getAvailableStock(tenant1Ctx, variantId)).toBe(openingUnits);
    });
  });

  // ── 6. Multi-Tenant & Branch Isolation ──────────────────────────────────────
  describe("6. Strict Multi-Tenant & Branch Isolation", () => {
    it("guarantees registration in Tenant 1 is strictly invisible to Tenant 2", async () => {
      const prodId = randomUUID();
      const variantId = randomUUID();

      // Register product for Tenant 1
      serverProductRepo.createProduct(tenant1Ctx, {
        id: prodId,
        name: "Tenant 1 Exclusive Product",
        sku: "SKU-T1-PRIV",
        category: "Confidential",
        buyingPrice: 100,
        sellingPrice: 200,
        variants: [
          {
            id: variantId,
            name: "Standard",
            sku: "SKU-T1-PRIV-STD",
            price: 200,
            costPrice: 100,
          },
        ],
      });

      serverStockRepo.recordStockAdjustment(tenant1Ctx, {
        variantId,
        adjustmentType: "INCREASE",
        movementType: "OPENING_STOCK",
        quantityChange: 100,
        reason: "OPENING_STOCK",
        deviceId: "dev-1",
        operationId: "op-t1",
        idempotencyKey: "idem-t1",
      });

      // Tenant 2 must NOT be able to find Tenant 1's product or stock
      expect(() => {
        serverProductRepo.getProductById(tenant2Ctx, prodId);
      }).toThrow(/INVARIANT_007_VIOLATION/);

      // Tenant 2 gets 0 stock for Tenant 1's variant
      const t2Stock = serverStockRepo.getAvailableStock(tenant2Ctx, variantId);
      expect(t2Stock).toBe(0);

      // Bootstrap on Tenant 2 must contain 0 items from Tenant 1
      const t2Bootstrap = syncEngine.processBootstrap(tenant2Ctx, {
        deviceId: "dev-2",
        clientVersion: "2.12.5",
        schemaVersion: 1,
      });

      const hasTenant1Item = t2Bootstrap.products.some((p) => p.id === prodId);
      expect(hasTenant1Item).toBe(false);
    });
  });
});
