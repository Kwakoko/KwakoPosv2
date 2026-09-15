import { randomUUID } from "crypto";
import type {
  TenantContext,
  RestaurantModuleManifest,
  RestaurantSettings,
  MenuItem,
  RecipeBOM,
  Table,
  KitchenOrder,
  WasteRecord,
  Reservation,
  RestaurantAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalRestaurantOperatingEngine,
  RestaurantOperatingEngine,
} from "@kwakopos2/domain";
import { StockLedgerEngine } from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class RestaurantService {
  private engine: RestaurantOperatingEngine;
  private store: InMemoryStore;

  private menuMap: Map<string, MenuItem> = new Map();
  private recipeMap: Map<string, RecipeBOM> = new Map();
  private tableMap: Map<string, Table> = new Map();
  private kitchenOrdersMap: Map<string, KitchenOrder> = new Map();
  private wasteRecordsMap: Map<string, WasteRecord> = new Map();
  private reservationsMap: Map<string, Reservation> = new Map();
  private stockLedger: StockLedgerEngine;

  constructor(engine?: RestaurantOperatingEngine, store?: InMemoryStore, stockLedger?: StockLedgerEngine) {
    this.engine = engine || globalRestaurantOperatingEngine;
    this.store = store || globalInMemoryStore;
    this.stockLedger = stockLedger || StockLedgerEngine.getInstance();
  }


  getManifest(): RestaurantModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): RestaurantSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  createMenuItem(ctx: TenantContext, item: Omit<MenuItem, "id" | "tenantId" | "branchId">): MenuItem {
    const id = randomUUID();
    const fullItem: MenuItem = {
      ...item,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
    };
    this.menuMap.set(id, fullItem);
    return fullItem;
  }

  getMenuItems(ctx: TenantContext): MenuItem[] {
    return Array.from(this.menuMap.values()).filter(
      (m) => m.tenantId === ctx.tenantId && m.branchId === ctx.branchId
    );
  }

  createRecipeBOM(ctx: TenantContext, recipe: Omit<RecipeBOM, "recipeId" | "tenantId" | "branchId" | "totalRecipeCost">): RecipeBOM {
    const menuItem = this.menuMap.get(recipe.menuItemId);
    const sellingPrice = menuItem ? menuItem.sellingPrice : 10000;
    const tempBOM: RecipeBOM = {
      ...recipe,
      recipeId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      totalRecipeCost: 0,
    };
    const costDetails = this.engine.calculateRecipeCost(tempBOM, sellingPrice);
    tempBOM.totalRecipeCost = costDetails.totalRecipeCost;

    this.recipeMap.set(tempBOM.recipeId, tempBOM);
    return tempBOM;
  }

  createKitchenOrder(
    ctx: TenantContext,
    req: {
      tableNumber?: string;
      orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "DRIVE_THRU" | "QR_ORDER";
      items: Array<{ menuItemId: string; menuItemName: string; quantity: number; category: string }>;
    }
  ): KitchenOrder {
    const orderId = randomUUID();
    const routedItems = this.engine.routeOrderToKitchenStations(req.items);
    const order: KitchenOrder = {
      id: orderId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      orderNumber: `KDS-${Math.floor(1000 + Math.random() * 9000)}`,
      tableNumber: req.tableNumber,
      waiterId: ctx.userId,
      orderType: req.orderType,
      items: routedItems,
      status: "NEW",
      createdAt: new Date().toISOString(),
      targetPrepTimeMinutes: 15,
    };
    this.kitchenOrdersMap.set(orderId, order);
    return order;
  }

  getKitchenOrders(ctx: TenantContext): KitchenOrder[] {
    return Array.from(this.kitchenOrdersMap.values()).filter(
      (o) => o.tenantId === ctx.tenantId && o.branchId === ctx.branchId
    );
  }

  /**
   * Mark a kitchen order as served/completed and consume all BOM ingredients
   * through the Core StockLedgerEngine (INTERNAL_CONSUMPTION / RECIPE_PRODUCTION).
   * This is the authoritative ingredient deduction path — it replaces any
   * plugin-private stock arithmetic.
   */
  confirmKitchenOrderServed(
    ctx: TenantContext,
    orderId: string
  ): { order: KitchenOrder; stockMovementIds: string[] } {
    const order = this.kitchenOrdersMap.get(orderId);
    if (!order) throw new Error(`KitchenOrder not found: ${orderId}`);
    if (order.tenantId !== ctx.tenantId || order.branchId !== ctx.branchId) {
      throw new Error("Tenant/branch isolation violation");
    }
    if (order.status === "SERVED" || order.status === "CANCELLED") {
      throw new Error(`Order already in terminal state: ${order.status}`);
    }

    const ledger = this.stockLedger;
    const stockMovementIds: string[] = [];


    // Iterate over each ordered item and consume its BOM ingredients
    for (const item of order.items) {
      const recipe = Array.from(this.recipeMap.values()).find(
        (r) => r.menuItemId === item.menuItemId
          && r.tenantId === ctx.tenantId
          && r.branchId === ctx.branchId
      );
      if (!recipe) continue; // item has no BOM — skip stock deduction

      for (const ingredient of recipe.ingredients) {
        const consumedQty = ingredient.quantityRequired * item.quantity;
        const movRecord = ledger.recordMovement(ctx, {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          movementType: "INTERNAL_CONSUMPTION",
          productId: ingredient.ingredientId,
          variantId: null,
          batchId: null,
          batchNumber: null,
          quantityDelta: -consumedQty, // negative → decrement
          unitCost: ingredient.unitCost,
          referenceType: "RECIPE_PRODUCTION",
          referenceId: orderId,
          actorId: ctx.userId,
          allowNegativeStock: false,
          notes: `Recipe BOM consumption: ${ingredient.ingredientName} x${consumedQty} ${ingredient.unitOfMeasure}`,
        });
        stockMovementIds.push(movRecord.id);
      }
    }

    // Advance order state — KitchenOrder schema uses actualPrepTimeMinutes, no completedAt field
    const elapsedMs = Date.now() - new Date(order.createdAt as string).getTime();
    const served: KitchenOrder = {
      ...order,
      status: "SERVED",
      actualPrepTimeMinutes: Math.round(elapsedMs / 60000),
    };
    this.kitchenOrdersMap.set(orderId, served);
    return { order: served, stockMovementIds };
  }

  /** Update kitchen order status (NEW → PREPARING → READY → SERVED | CANCELLED) */
  markKitchenOrderStatus(
    ctx: TenantContext,
    orderId: string,
    status: KitchenOrder["status"]
  ): KitchenOrder {
    const order = this.kitchenOrdersMap.get(orderId);
    if (!order) throw new Error(`KitchenOrder not found: ${orderId}`);
    if (order.tenantId !== ctx.tenantId || order.branchId !== ctx.branchId) {
      throw new Error("Tenant/branch isolation violation");
    }
    const updated: KitchenOrder = { ...order, status };
    this.kitchenOrdersMap.set(orderId, updated);
    return updated;
  }

  logWaste(ctx: TenantContext, waste: Omit<WasteRecord, "id" | "tenantId" | "branchId" | "totalWasteCost" | "loggedByUserId" | "timestamp">): WasteRecord {
    const id = randomUUID();
    const totalWasteCost = waste.quantity * waste.unitCost;
    const fullWaste: WasteRecord = {
      ...waste,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      totalWasteCost,
      loggedByUserId: ctx.userId,
      timestamp: new Date().toISOString(),
    };
    this.wasteRecordsMap.set(id, fullWaste);

    // Route waste stock decrement through Core StockLedgerEngine
    const ledger = this.stockLedger;
    ledger.recordMovement(ctx, {

      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      movementType: "WASTE",
      productId: waste.itemId,       // WasteRecord uses itemId (not ingredientId)
      variantId: null,
      batchId: null,
      batchNumber: null,
      quantityDelta: -waste.quantity, // negative → decrement
      unitCost: waste.unitCost,
      referenceType: "MANUAL",
      referenceId: id,
      actorId: ctx.userId,
      notes: `Waste: ${waste.reason} — ${waste.itemName}`, // WasteRecord uses reason (not wasteReason)
    });

    return fullWaste;
  }

  getAiRecommendations(ctx: TenantContext): RestaurantAiRecommendation[] {
    const menu = this.getMenuItems(ctx);
    const orders = this.getKitchenOrders(ctx);
    const waste = Array.from(this.wasteRecordsMap.values()).filter(
      (w) => w.tenantId === ctx.tenantId && w.branchId === ctx.branchId
    );

    return this.engine.generateExplainableAiRecommendations(ctx, menu, orders, waste);
  }
}

export const globalRestaurantService = new RestaurantService();
