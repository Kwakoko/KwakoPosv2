import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { enqueueOutbox, processOutbox, retryWithBackoff } from "../../apps/web/src/atomicOutbox.js";
import { reconcileInventory } from "../../apps/web/src/clientSyncEngine.js";
import { recordPosSaleDeductions } from "../../apps/web/src/services/inventoryStockService.js";
import type { Product, ProductVariant } from "@kwakopos2/contracts";

describe("Outbox Persistence & Reconciliation Integration Drill", () => {
  let db: LocalIndexedDbStore;
  const variantId = "var-integ-100";
  const productId = "prod-integ-100";

  beforeEach(async () => {
    db = new LocalIndexedDbStore(4);
    await db.ready;

    const prod: Product = {
      id: productId,
      name: "Sunflower Cooking Oil 5L",
      sku: "OIL-SUN-5L",
      category: "Edibles",
      sellingPrice: 35000,
      costPrice: 28000,
      hasVariants: true,
      variants: [],
    } as any;
    db.saveProductLocal(prod);

    const variant: ProductVariant = {
      id: variantId,
      productId,
      name: "5L Jerrycan",
      sku: "OIL-5L",
      price: 35000,
      costPrice: 28000,
      inventoryQuantity: 100,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveVariantLocal(variant);
  });

  it("adds 5 offline sales, retries with exponential backoff on failure, and reconciles ledger and inventory consistently", async () => {
    // 1. Add 5 sales offline (2 units each = 10 units total)
    const saleIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const saleId = `SALE-OFFLINE-SEQ-00${i}`;
      saleIds.push(saleId);

      // Record stock deductions locally (deducts variant, writes ledger, records pending StockAdjustment)
      recordPosSaleDeductions(db, {
        saleId,
        items: [{ productId, variantId, qty: 2, unitCost: 28000 }],
        tenantId: "tenant-integ-1",
        branchId: "branch-integ-1",
      });

      // Enqueue to outbox before any network attempt
      await enqueueOutbox(
        {
          entityType: "Sale",
          entityId: saleId,
          operationType: "CREATE",
          payload: {
            id: saleId,
            items: [{ variantId, qty: 2, price: 35000 }],
            total: 70000,
          },
        },
        db
      );
    }

    // Verify 5 items pending in outbox
    const pendingItems = await db.outbox.where("status").equals("PENDING").toArray();
    expect(pendingItems.length).toBe(5);

    // Verify local inventory shows 100 - (5 * 2) = 90
    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(90);

    // 2. Simulate network push failure with exponential backoff
    let attemptsCount = 0;
    const failingPush = vi.fn().mockImplementation(async () => {
      attemptsCount++;
      throw new Error("ERR_NETWORK_UNREACHABLE: Simulated Gateway Failure");
    });

    // Run processOutbox with scaled-down baseDelay for fast test execution
    const failResult = await processOutbox({
      db,
      apiPush: failingPush,
      retries: 3,
      baseDelay: 10,
      factor: 2,
    });

    expect(failResult.failed).toBe(5);
    expect(failResult.succeeded).toBe(0);
    // 5 items * 3 retries each = 15 attempts
    expect(attemptsCount).toBe(15);

    // Assert that errors were persisted and items marked FAILED with error messages
    const failedItems = db.getFailedOutbox();
    expect(failedItems.length).toBe(5);
    for (const item of failedItems) {
      expect(item.status).toBe("FAILED");
      const errReason = db.syncMetadata.get(`error_${item.id}`);
      expect(errReason).toContain("ERR_NETWORK_UNREACHABLE");
    }

    // 3. Reset failed items to retryable PENDING state
    for (const item of failedItems) {
      db.retryOutbox(item.id);
    }
    expect(db.getPendingOutbox().length).toBe(5);

    // 4. Simulate network recovery and successful outbox processing
    const successfulPush = vi.fn().mockResolvedValue({ success: true });
    const successResult = await processOutbox({
      db,
      apiPush: successfulPush,
      retries: 3,
      baseDelay: 10,
      factor: 2,
    });

    expect(successResult.succeeded).toBe(5);
    expect(successResult.failed).toBe(0);
    expect(db.getPendingOutbox().length).toBe(0);

    // 5. Server snapshot arrives with original baseline (100 units)
    const serverBaselineSnapshot: ProductVariant = {
      id: variantId,
      productId,
      name: "5L Jerrycan",
      sku: "OIL-5L",
      price: 35000,
      costPrice: 28000,
      inventoryQuantity: 100,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Reconcile snapshot on top of local deltas
    const reconciledQty = await reconcileInventory(serverBaselineSnapshot, db);

    // Reconciled stock must reflect baseline (100) minus all 5 sales (-10) = 90
    expect(reconciledQty).toBe(90);
    expect(db.productVariants.get(variantId)?.inventoryQuantity).toBe(90);

    // 6. Verify ledger integrity: 5 distinct sale entries exist totaling -10
    const ledgerEntries = Array.from(db.stockLedger.values()).filter(
      (entry) => entry.variantId === variantId
    );
    expect(ledgerEntries.length).toBe(5);
    const totalDeducted = ledgerEntries.reduce(
      (sum, entry) => sum + Number((entry as any).quantityChange || entry.quantity || 0),
      0
    );
    expect(totalDeducted).toBe(-10);
  });
});
