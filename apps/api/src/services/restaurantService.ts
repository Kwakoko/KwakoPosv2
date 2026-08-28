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

  constructor(engine?: RestaurantOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalRestaurantOperatingEngine;
    this.store = store || globalInMemoryStore;
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
