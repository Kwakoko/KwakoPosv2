import { describe, it, expect, beforeEach } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { reconcileInventory } from "../../apps/web/src/clientSyncEngine.js";
import { enqueueOutbox } from "../../apps/web/src/atomicOutbox.js";
import { recordPosSaleDeductions } from "../../apps/web/src/services/inventoryStockService.js";
import type { Product, ProductVariant } from "@kwakopos2/contracts";

describe("Snapshot Reconciliation Fix (Invisible Sale Prevention)", () => {
  let db: LocalIndexedDbStore;

  beforeEach(async () => {
    db = new LocalIndexedDbStore(4);
    await db.ready;
  });

  it("applies local pending deltas on top of server baseline snapshot", async () => {
    const variantId = "var-test-01";
    const productId = "prod-test-01";

    // 1. Initial local product and variant state (50 units)
    const product: Product = {
      id: productId,
      name: "Tanzanian Arabica Coffee",
      sku: "COF-ARABICA",
      category: "Beverages",
      sellingPrice: 15000,
      costPrice: 9000,
      hasVariants: true,
      variants: [],
    } as any;
    db.saveProductLocal(product);

    const initialVariant: ProductVariant = {
      id: variantId,
      tenantId: "tenant-001",
      branchId: "branch-001",
      productId,
      name: "500g Roasted Beans",
      sku: "COF-500G",
      price: 15000,
      costPrice: 9000,
      inventoryQuantity: 50,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveVariantLocal(initialVariant);
    db.stockLedger.set("opening-" + variantId, {
      id: "opening-" + variantId,
      tenantId: "tenant-001",
      branchId: "branch-001",
      productId,
      variantId,
      quantityChange: 50,
      quantity: 50,
    });

    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(50);

    // 2. Perform offline POS sale of 2 units
    const saleId = "SALE-OFFLINE-TEST-1";
    await recordPosSaleDeductions(db, {
      saleId,
      items: [{ productId, variantId, qty: 2, unitCost: 9000 }],
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    // Enqueue sale transaction in outbox
    await enqueueOutbox(
      {
        entityType: "Sale",
        entityId: saleId,
        operationType: "CREATE",
        payload: { id: saleId, total: 30000, items: [{ variantId, qty: 2 }] },
        tenantId: "tenant-001",
        branchId: "branch-001",
      },
      db
    );

    // Verify local variant inventory was reduced to 48
    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(48);

    // Verify a pending stock adjustment delta of -2 was recorded in db.stockAdjustments
    const pendingDeltas = await db.stockAdjustments
      .where("variantId")
      .equals(variantId)
      .and((adj: any) => adj.status === "PENDING")
      .toArray();

    expect(pendingDeltas.length).toBe(1);
    expect(pendingDeltas[0].change).toBe(-2);

    // 3. Simulate receiving server snapshot: server baseline still has 50 units
    // (e.g. server hasn't received our offline sale yet)
    const serverSnapshot: ProductVariant = {
      ...initialVariant,
      inventoryQuantity: 50,
      updatedAt: new Date().toISOString(),
    };

    // Reconcile server snapshot against local pending deltas
    const reconciledQty = await reconcileInventory(serverSnapshot, db);

    // CRITICAL: Reconciled quantity must be 48 (50 - 2), NOT overwritten to 50!
    expect(reconciledQty).toBe(48);
    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(48);

    // Verify local delta is marked RECONCILED after merge
    const remainingPending = await db.stockAdjustments
      .where("variantId")
      .equals(variantId)
      .and((adj: any) => adj.status === "PENDING")
      .toArray();
    expect(remainingPending.length).toBe(0);

    const reconciledRecord = db.stockAdjustments.get(pendingDeltas[0].id);
    expect(reconciledRecord?.status).toBe("RECONCILED");
  });

  it("accurately merges concurrent server restock with offline local sales", async () => {
    const variantId = "var-test-02";
    const productId = "prod-test-02";

    const product: Product = {
      id: productId,
      name: "Fresh Milk",
      sku: "MILK",
      category: "Dairy",
      sellingPrice: 2500,
      costPrice: 1800,
      hasVariants: true,
      variants: [],
    } as any;
    db.saveProductLocal(product);

    const variant: ProductVariant = {
      id: variantId,
      tenantId: "tenant-001",
      branchId: "branch-001",
      productId,
      name: "Fresh Milk 1L",
      sku: "MILK-1L",
      price: 2500,
      costPrice: 1800,
      inventoryQuantity: 20,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveVariantLocal(variant);
    db.stockLedger.set("opening-" + variantId, {
      id: "opening-" + variantId,
      tenantId: "tenant-001",
      branchId: "branch-001",
      productId,
      variantId,
      quantityChange: 20,
      quantity: 20,
    });

    // Offline sale of 5 units
    await recordPosSaleDeductions(db, {
      saleId: "SALE-OFFLINE-TEST-2",
      items: [{ productId, variantId, qty: 5, unitCost: 1800 }],
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(15);

    // Server concurrently restocked +30 units (now total 50 on server)
    const serverRestockedSnapshot: ProductVariant = {
      ...variant,
      inventoryQuantity: 50,
      updatedAt: new Date().toISOString(),
    };

    // Reconcile
    const finalQty = await reconcileInventory(serverRestockedSnapshot, db);

    // Reconciled quantity: 50 server baseline - 5 local pending sold = 45!
    expect(finalQty).toBe(45);
    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(45);
  });
});
