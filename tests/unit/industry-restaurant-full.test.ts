import { describe, it, expect } from "vitest";
import { RestaurantOperatingEngine } from "../../packages/domain/src/restaurantEngine.js";
import { runRestaurantCertification } from "../../scripts/certification/runRestaurantCertification.js";
import { renderRestaurantDashboard } from "../../apps/web/src/restaurantDashboard.js";
import { globalRestaurantService } from "../../apps/api/src/services/restaurantService.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Restaurant Operating System Full 36-Pillar Test Suite", () => {
  const engine = new RestaurantOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["ADMIN"],
    permissions: ["RESTAURANT_POS_ORDER"],
  };

  it("should return valid Restaurant manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("restaurant_operating_system");
    expect(manifest.supportedFormats).toContain("FINE_DINING");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.serviceChargePct).toBe(5.0);
  });

  it("should calculate Recipe BOM cost & gross margin: Ingredient + Packaging + Production", () => {
    const recipe = {
      recipeId: "rec-1",
      menuItemId: "menu-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      ingredients: [
        { ingredientId: "ing-1", ingredientName: "Chicken Fillet", quantityRequired: 0.25, unitOfMeasure: "kg", unitCost: 12000, wasteAllowancePct: 10 },
        { ingredientId: "ing-2", ingredientName: "Burger Bun", quantityRequired: 1, unitOfMeasure: "pc", unitCost: 500, wasteAllowancePct: 0 },
      ],
      packagingCost: 400,
      productionCost: 300,
      totalRecipeCost: 0,
    };

    const costDetails = engine.calculateRecipeCost(recipe, 15000);
    // Chicken: 0.25 * 12000 * 1.10 = 3300. Bun: 500. Subtotal: 3800. Packaging: 400. Production: 300 -> Total: 4500
    expect(costDetails.ingredientCost).toBe(3800);
    expect(costDetails.totalRecipeCost).toBe(4500);
    expect(costDetails.grossProfit).toBe(10500);
    expect(costDetails.foodCostPct).toBe(30.0);
  });

  it("should route kitchen order items to appropriate stations (GRILL, FRY, BAR, SALAD)", () => {
    const items = [
      { menuItemId: "m1", menuItemName: "Grilled Steak", quantity: 2, category: "Mains" },
      { menuItemId: "m2", menuItemName: "French Fries", quantity: 1, category: "Fried Sides" },
      { menuItemId: "m3", menuItemName: "Mango Smoothie", quantity: 2, category: "Beverages" },
    ];

    const routed = engine.routeOrderToKitchenStations(items);
    expect(routed[0].station).toBe("GRILL");
    expect(routed[1].station).toBe("FRY");
    expect(routed[2].station).toBe("BAR");
  });

  it("should classify menu engineering matrix (Stars, Plowhorses, Puzzles, Dogs)", () => {
    const menuItems = [
      { id: "m1", name: "Popular High Profit Item", salesVolume: 100, grossProfit: 8000 },
      { id: "m2", name: "Popular Low Profit Item", salesVolume: 100, grossProfit: 2000 },
      { id: "m3", name: "Unpopular High Profit Item", salesVolume: 10, grossProfit: 8000 },
      { id: "m4", name: "Unpopular Low Profit Item", salesVolume: 10, grossProfit: 2000 },
    ];

    const matrix = engine.categorizeMenuEngineering(menuItems);
    expect(matrix.find((m) => m.id === "m1")?.category).toBe("STAR");
    expect(matrix.find((m) => m.id === "m2")?.category).toBe("PLOWHORSE");
    expect(matrix.find((m) => m.id === "m3")?.category).toBe("PUZZLE");
    expect(matrix.find((m) => m.id === "m4")?.category).toBe("DOG");
  });

  it("should run 36-Point Restaurant OS Certification Campaign", async () => {
    const cert = await runRestaurantCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(36);
  });

  it("should render Super Admin & KDS Restaurant HTML Dashboard", () => {
    const html = renderRestaurantDashboard();
    expect(html).toContain("KwakoPos Restaurant & Kitchen Display System");
    expect(html).toContain("LIVE KITCHEN DISPLAY STATIONS (KDS)");
  });

  it("should create kitchen orders via globalRestaurantService", () => {
    const order = globalRestaurantService.createKitchenOrder(dummyCtx, {
      tableNumber: "T-05",
      orderType: "DINE_IN",
      items: [{ menuItemId: "m1", menuItemName: "Grilled Chicken", quantity: 2, category: "Main" }],
    });
    expect(order.tableNumber).toBe("T-05");
    expect(order.items).toHaveLength(1);

    const activeOrders = globalRestaurantService.getKitchenOrders(dummyCtx);
    expect(activeOrders.length).toBeGreaterThan(0);
  });
});
