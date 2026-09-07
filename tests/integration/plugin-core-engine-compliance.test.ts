/**
 * Plugin Core Engine Compliance Integration Test Suite
 * =====================================================
 * Verifies that industry plugins (Pharmacy, Restaurant) route all inventory
 * writes through the Core StockLedgerEngine rather than private state —
 * i.e., confirms that the Core Engine Layer is the single authoritative
 * source of truth for stock movements across all plugins.
 *
 * Tests:
 *   1. PharmacyService.receiveBatch()   → produces StockLedgerEngine movements
 *   2. PharmacyService.dispenseMedicineFEFO() → produces StockLedgerEngine SALE decrements
 *   3. RestaurantService.confirmKitchenOrderServed() → produces INTERNAL_CONSUMPTION movements
 *   4. RestaurantService.logWaste()     → produces WASTE stock movements
 *   5. Tenant isolation — pharmacy/restaurant data is isolated per tenant
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { StockLedgerEngine, InventoryEngine } from "@kwakopos2/domain";
import { PharmacyService } from "../../apps/api/src/services/pharmacyService.js";
import { RestaurantService } from "../../apps/api/src/services/restaurantService.js";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TENANT_A = "tenant-plugin-test-a0000-000000000001";
const TENANT_B = "tenant-plugin-test-b0000-000000000002";
const BRANCH_A = "branch-plugin-test-a0000-000000000001";
const BRANCH_B = "branch-plugin-test-b0000-000000000002";
const USER_1 = "user-plugin-test-00000-000000000001";

function makeCtx(tenantId = TENANT_A, branchId = BRANCH_A): TenantContext {
  return { tenantId, branchId, userId: USER_1, roles: ["CASHIER"] } as TenantContext;
}

// Reset singletons before each test
beforeEach(() => {
  StockLedgerEngine.resetInstance();
  InventoryEngine.resetInstance();
});

// ===========================================================================
// 1. Pharmacy Plugin — Stock Ledger Compliance
// ===========================================================================

describe("PharmacyService — Core Engine Compliance", () => {
  const ctx = makeCtx();

  it("receiveBatch() produces a PURCHASE_RECEIPT movement in StockLedgerEngine", () => {
    const service = new PharmacyService();
    const ledger = StockLedgerEngine.getInstance();

    const medicine = service.createMedicine(ctx, {
      genericName: "Paracetamol",
      brandName: "Panadol",
      strength: "500mg",
      form: "TABLET",
      sellingPrice: 200,
      dispensingUnit: "Tablet",
      requiresPrescription: false,
      isControlledSubstance: false,
      category: "Analgesic",
      storageCondition: "Room temperature",
      reorderLevel: 100,
    });

    const medicineId = medicine.id;
    const beforeBalance = ledger.getBalance(ctx, TENANT_A, BRANCH_A, medicineId, null);
    expect(beforeBalance).toBe(0);

    service.receiveBatch(ctx, {
      medicineId,
      batchNumber: "BATCH-P001",
      initialQuantity: 200,
      unitCost: 80,
      expiryDate: "2027-06-30",
      manufacturedDate: "2025-01-01",
      supplierId: null,
    });

    const afterBalance = ledger.getBalance(ctx, TENANT_A, BRANCH_A, medicineId, null);
    expect(afterBalance).toBe(200);

    // Verify the movement type
    const history = ledger.getMovementHistory(ctx, TENANT_A, BRANCH_A, medicineId);
    const purchaseMovement = history.find((m) => m.movementType === "PURCHASE_RECEIPT");
    expect(purchaseMovement).toBeDefined();
    expect(purchaseMovement!.quantityDelta).toBe(200);
    expect(purchaseMovement!.referenceType).toBe("PURCHASE");
  });

  it("dispenseMedicineFEFO() produces SALE decrements in StockLedgerEngine", () => {
    const service = new PharmacyService();
    const ledger = StockLedgerEngine.getInstance();

    const medicine = service.createMedicine(ctx, {
      genericName: "Amoxicillin",
      brandName: "Amoxil",
      strength: "250mg",
      form: "CAPSULE",
      sellingPrice: 150,
      dispensingUnit: "Capsule",
      requiresPrescription: false,
      isControlledSubstance: false,
      category: "Antibiotic",
      storageCondition: "Cool and dry",
      reorderLevel: 50,
    });

    // Stock intake
    service.receiveBatch(ctx, {
      medicineId: medicine.id,
      batchNumber: "BATCH-A001",
      initialQuantity: 100,
      unitCost: 60,
      expiryDate: "2028-12-31",
      manufacturedDate: "2025-01-01",
      supplierId: null,
    });

    const balanceAfterReceipt = ledger.getBalance(ctx, TENANT_A, BRANCH_A, medicine.id, null);
    expect(balanceAfterReceipt).toBe(100);

    // Dispense 10 capsules
    const result = service.dispenseMedicineFEFO(ctx, {
      medicineId: medicine.id,
      quantityRequired: 10,
    });

    expect(result.fulfilled).toBe(true);
    expect(result.dispensingRecords.length).toBeGreaterThan(0);

    // StockLedger should reflect the decrement
    const balanceAfterDispense = ledger.getBalance(ctx, TENANT_A, BRANCH_A, medicine.id, null);
    expect(balanceAfterDispense).toBe(90); // 100 - 10

    // Verify movement type in ledger
    const history = ledger.getMovementHistory(ctx, TENANT_A, BRANCH_A, medicine.id);
    const saleMovements = history.filter((m) => m.movementType === "SALE");
    expect(saleMovements.length).toBeGreaterThan(0);
  });

  it("pharmacy tenant isolation — TENANT_A stock not visible from TENANT_B", () => {
    const ctxA = makeCtx(TENANT_A, BRANCH_A);
    const ctxB = makeCtx(TENANT_B, BRANCH_B);
    const ledger = StockLedgerEngine.getInstance();

    const serviceA = new PharmacyService();
    const medicine = serviceA.createMedicine(ctxA, {
      genericName: "Ibuprofen",
      brandName: "Brufen",
      strength: "400mg",
      form: "TABLET",
      sellingPrice: 100,
      dispensingUnit: "Tablet",
      requiresPrescription: false,
      isControlledSubstance: false,
      category: "NSAID",
      storageCondition: "Room temperature",
      reorderLevel: 50,
    });

    serviceA.receiveBatch(ctxA, {
      medicineId: medicine.id,
      batchNumber: "BATCH-ISO-001",
      initialQuantity: 500,
      unitCost: 40,
      expiryDate: "2028-01-01",
      manufacturedDate: "2025-01-01",
      supplierId: null,
    });

    // TENANT_A has 500
    expect(ledger.getBalance(ctxA, TENANT_A, BRANCH_A, medicine.id, null)).toBe(500);

    // TENANT_B should see 0
    expect(ledger.getBalance(ctxB, TENANT_B, BRANCH_B, medicine.id, null)).toBe(0);
  });
});

// ===========================================================================
// 2. Restaurant Plugin — Stock Ledger Compliance
// ===========================================================================

describe("RestaurantService — Core Engine Compliance", () => {
  const ctx = makeCtx();

  function createMenuItemWithRecipe(service: RestaurantService) {
    const menuItem = service.createMenuItem(ctx, {
      name: "Grilled Chicken",
      category: "Main Course",
      sellingPrice: 15000,
      costPrice: 6000,
      preparationTimeMinutes: 20,
    });

    const ingredientId = randomUUID();

    // Seed stock for the ingredient
    const ledger = StockLedgerEngine.getInstance();
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: ingredientId, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 50, unitCost: 5000, // 50 kg chicken
      referenceType: "PURCHASE", referenceId: "rest-po-001", actorId: USER_1,
    });

    const recipe = service.createRecipeBOM(ctx, {
      menuItemId: menuItem.id,
      ingredients: [
        {
          ingredientId,
          ingredientName: "Chicken Breast",
          quantityRequired: 0.5, // 500g per portion
          unitOfMeasure: "kg",
          unitCost: 5000,
          wasteAllowancePct: 5,
        },
      ],
      packagingCost: 200,
      productionCost: 500,
    });

    return { menuItem, recipe, ingredientId };
  }

  it("confirmKitchenOrderServed() produces INTERNAL_CONSUMPTION movements for BOM ingredients", () => {
    const service = new RestaurantService();
    const ledger = StockLedgerEngine.getInstance();

    const { menuItem, ingredientId } = createMenuItemWithRecipe(service);

    const order = service.createKitchenOrder(ctx, {
      orderType: "DINE_IN",
      tableNumber: "T5",
      items: [{ menuItemId: menuItem.id, menuItemName: menuItem.name, quantity: 2, category: menuItem.category }],
    });

    const balanceBefore = ledger.getBalance(ctx, TENANT_A, BRANCH_A, ingredientId, null);
    expect(balanceBefore).toBe(50);

    const result = service.confirmKitchenOrderServed(ctx, order.id);

    expect(result.order.status).toBe("SERVED");
    expect(result.stockMovementIds.length).toBeGreaterThan(0);

    // 2 portions × 0.5 kg each = 1 kg consumed
    const balanceAfter = ledger.getBalance(ctx, TENANT_A, BRANCH_A, ingredientId, null);
    expect(balanceAfter).toBe(49); // 50 - 1
  });

  it("confirmKitchenOrderServed() throws on terminal order state (idempotency guard)", () => {
    StockLedgerEngine.resetInstance(); // fresh ledger
    const ledger = StockLedgerEngine.getInstance();
    const service = new RestaurantService(undefined, undefined, ledger);

    const { menuItem, ingredientId } = createMenuItemWithRecipe(service);


    // Seed fresh stock since we reset ledger
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: ingredientId, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 50, unitCost: 5000, referenceType: "PURCHASE",
      referenceId: "rest-po-002", actorId: USER_1,
    });

    const order = service.createKitchenOrder(ctx, {
      orderType: "TAKEAWAY",
      items: [{ menuItemId: menuItem.id, menuItemName: menuItem.name, quantity: 1, category: menuItem.category }],
    });

    service.confirmKitchenOrderServed(ctx, order.id); // first confirm — OK

    expect(() =>
      service.confirmKitchenOrderServed(ctx, order.id) // second confirm — should throw
    ).toThrow(/terminal state/i);
  });

  it("logWaste() produces a WASTE movement in StockLedgerEngine", () => {
    const service = new RestaurantService();
    const ledger = StockLedgerEngine.getInstance();

    const ingredientId = randomUUID();

    // Seed ingredient stock
    ledger.recordMovement(ctx, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: ingredientId, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 10, unitCost: 2000, referenceType: "PURCHASE",
      referenceId: "rest-waste-po-001", actorId: USER_1,
    });

    service.logWaste(ctx, {
      itemId: ingredientId,
      itemName: "Tomato",
      quantity: 2,
      unitOfMeasure: "kg",
      unitCost: 2000,
      reason: "SPOILAGE",
    });

    const balanceAfter = ledger.getBalance(ctx, TENANT_A, BRANCH_A, ingredientId, null);
    expect(balanceAfter).toBe(8); // 10 - 2

    const history = ledger.getMovementHistory(ctx, TENANT_A, BRANCH_A, ingredientId);
    const wasteMovement = history.find((m) => m.movementType === "WASTE");
    expect(wasteMovement).toBeDefined();
    expect(wasteMovement!.quantityDelta).toBe(-2);
    expect(wasteMovement!.referenceType).toBe("MANUAL");
  });

  it("restaurant tenant isolation — TENANT_B stock not affected by TENANT_A operations", () => {
    const ctxA = makeCtx(TENANT_A, BRANCH_A);
    const ctxB = makeCtx(TENANT_B, BRANCH_B);
    const ledger = StockLedgerEngine.getInstance();

    const ingredientId = randomUUID();

    // Seed stock for TENANT_A
    ledger.recordMovement(ctxA, {
      tenantId: TENANT_A, branchId: BRANCH_A, movementType: "PURCHASE_RECEIPT",
      productId: ingredientId, variantId: null, batchId: null, batchNumber: null,
      quantityDelta: 30, unitCost: 1000, referenceType: "PURCHASE",
      referenceId: "isolation-po-001", actorId: USER_1,
    });

    // TENANT_B should have 0
    expect(ledger.getBalance(ctxB, TENANT_B, BRANCH_B, ingredientId, null)).toBe(0);

    // TENANT_A should have 30
    expect(ledger.getBalance(ctxA, TENANT_A, BRANCH_A, ingredientId, null)).toBe(30);
  });
});
