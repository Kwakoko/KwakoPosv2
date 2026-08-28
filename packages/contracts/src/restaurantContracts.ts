import { z } from "zod";

export const RestaurantModuleManifestSchema = z.object({
  moduleId: z.literal("restaurant_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedFormats: z.array(
    z.enum([
      "FINE_DINING",
      "CASUAL_DINING",
      "QUICK_SERVICE",
      "FAST_FOOD",
      "BAR_PUB_LOUNGE",
      "FOOD_TRUCK",
      "BAKERY_CAFE",
      "CLOUD_KITCHEN",
      "CATERING",
    ])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type RestaurantModuleManifest = z.infer<typeof RestaurantModuleManifestSchema>;

export const RestaurantSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  serviceChargePct: z.number().default(5.0),
  taxRatePct: z.number().default(18.0),
  taxInclusivePricing: z.boolean().default(true),
  autoRouteOrdersToKDS: z.boolean().default(true),
  defaultPrepTimeMinutes: z.number().default(15),
  enableTableManagement: z.boolean().default(true),
  enableRecipeDeductionOnOrder: z.boolean().default(true),
  kitchenStationRouting: z.array(z.string()).default(["GRILL", "FRY", "SALAD", "BAR", "DESSERT", "PACKING"]),
});
export type RestaurantSettings = z.infer<typeof RestaurantSettingsSchema>;

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  description: z.string().optional(),
  sellingPrice: z.number(),
  costPrice: z.number(),
  preparationTimeMinutes: z.number(),
  allergens: z.array(z.string()).optional(),
  isAvailable: z.boolean().default(true),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const RecipeIngredientSchema = z.object({
  ingredientId: z.string().uuid(),
  ingredientName: z.string(),
  quantityRequired: z.number(),
  unitOfMeasure: z.string(),
  unitCost: z.number(),
  wasteAllowancePct: z.number().default(5.0),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeBOMSchema = z.object({
  recipeId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  ingredients: z.array(RecipeIngredientSchema),
  packagingCost: z.number().default(0),
  productionCost: z.number().default(0),
  totalRecipeCost: z.number(),
});
export type RecipeBOM = z.infer<typeof RecipeBOMSchema>;

export const TableStatusEnum = z.enum([
  "AVAILABLE",
  "RESERVED",
  "SEATED",
  "ORDERING",
  "PREPARING",
  "SERVED",
  "PAYMENT",
  "CLEANING",
]);
export type TableStatus = z.infer<typeof TableStatusEnum>;

export const TableSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  tableNumber: z.string(),
  floorSection: z.string(),
  seatingCapacity: z.number(),
  status: TableStatusEnum,
  currentOrderId: z.string().uuid().optional(),
});
export type Table = z.infer<typeof TableSchema>;

export const KitchenOrderStatusEnum = z.enum([
  "NEW",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "READY_FOR_SERVICE",
  "SERVED",
  "CANCELLED",
]);
export type KitchenOrderStatus = z.infer<typeof KitchenOrderStatusEnum>;

export const KitchenOrderItemSchema = z.object({
  itemId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  menuItemName: z.string(),
  station: z.string(),
  quantity: z.number(),
  specialNotes: z.string().optional(),
  status: KitchenOrderStatusEnum,
});
export type KitchenOrderItem = z.infer<typeof KitchenOrderItemSchema>;

export const KitchenOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  orderNumber: z.string(),
  tableNumber: z.string().optional(),
  waiterId: z.string().uuid().optional(),
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "DRIVE_THRU", "QR_ORDER"]),
  items: z.array(KitchenOrderItemSchema),
  status: KitchenOrderStatusEnum,
  createdAt: z.string().or(z.date()),
  targetPrepTimeMinutes: z.number(),
  actualPrepTimeMinutes: z.number().optional(),
});
export type KitchenOrder = z.infer<typeof KitchenOrderSchema>;

export const WasteRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemName: z.string(),
  quantity: z.number(),
  unitOfMeasure: z.string(),
  unitCost: z.number(),
  totalWasteCost: z.number(),
  reason: z.enum([
    "SPOILAGE",
    "EXPIRED",
    "PREPARATION_WASTE",
    "COOKING_LOSS",
    "PLATE_WASTE",
    "DAMAGED",
    "OVERPRODUCTION",
    "RETURNED_FOOD",
    "STAFF_MEAL",
  ]),
  loggedByUserId: z.string().uuid(),
  timestamp: z.string().or(z.date()),
});
export type WasteRecord = z.infer<typeof WasteRecordSchema>;

export const ReservationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string(),
  partySize: z.number(),
  tableNumber: z.string().optional(),
  reservationDate: z.string(),
  reservationTime: z.string(),
  status: z.enum(["REQUESTED", "CONFIRMED", "SEATED", "COMPLETED", "NO_SHOW", "CANCELLED"]),
  depositAmount: z.number().default(0),
});
export type Reservation = z.infer<typeof ReservationSchema>;

export const RestaurantAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "KITCHEN_BOTTLENECK",
    "MENU_ENGINEERING",
    "HIGH_WASTE_RECIPE",
    "DEMAND_FORECAST",
    "MARGIN_EROSION",
    "NO_SHOW_PREDICTION",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type RestaurantAiRecommendation = z.infer<typeof RestaurantAiRecommendationSchema>;

export const RestaurantEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  evaluations: z.array(
    z.object({
      pillarId: z.number(),
      pillarName: z.string(),
      passed: z.boolean(),
      details: z.string(),
    })
  ),
  digest: z.string(),
});
export type RestaurantEvidencePackage = z.infer<typeof RestaurantEvidencePackageSchema>;
