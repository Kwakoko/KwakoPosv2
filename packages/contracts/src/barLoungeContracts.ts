import { z } from "zod";

export const BarTableStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "SEATED",
  "ORDERING",
  "ACTIVE_TAB",
  "PAYMENT",
  "CLOSED",
  "CLEANING",
]);
export type BarTableStatus = z.infer<typeof BarTableStatusSchema>;

export const VenueMasterRecordSchema = z.object({
  id: z.string().uuid(),
  venueCode: z.string(),
  venueName: z.string(),
  venueType: z.enum(["BAR", "PUB", "LOUNGE", "NIGHTCLUB", "RESTAURANT_BAR", "SPORTS_BAR", "ROOFTOP_LOUNGE"]),
  totalTablesCount: z.number().int().positive(),
  activeTabCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type VenueMasterRecord = z.infer<typeof VenueMasterRecordSchema>;

export const TableMasterRecordSchema = z.object({
  id: z.string().uuid(),
  tableNumber: z.string(),
  venueId: z.string().uuid(),
  sectionName: z.string(),
  capacity: z.number().int().positive(),
  status: BarTableStatusSchema,
  currentTabId: z.string().uuid().optional(),
});
export type TableMasterRecord = z.infer<typeof TableMasterRecordSchema>;

export const RecipeIngredientItemSchema = z.object({
  ingredientSku: z.string(),
  ingredientName: z.string(),
  portionQuantity: z.number().positive(),
  unitOfMeasure: z.string(),
  unitCostUsd: z.number().nonnegative(),
});
export type RecipeIngredientItem = z.infer<typeof RecipeIngredientItemSchema>;

export const GuestTabRecordSchema = z.object({
  id: z.string().uuid(),
  tabNumber: z.string(),
  venueId: z.string().uuid(),
  tableId: z.string().uuid(),
  serverId: z.string().uuid(),
  guestName: z.string().optional(),
  orderedItems: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      itemName: z.string(),
      quantity: z.number().positive(),
      unitPriceUsd: z.number().nonnegative(),
      totalUsd: z.number().nonnegative(),
    })
  ),
  subtotalUsd: z.number().nonnegative(),
  taxTotalUsd: z.number().nonnegative(),
  discountUsd: z.number().min(0).default(0),
  grandTotalUsd: z.number().nonnegative(),
  paidAmountUsd: z.number().nonnegative().default(0),
  status: z.enum(["OPEN", "PAYMENT_PENDING", "CLOSED", "VOIDED"]),
});
export type GuestTabRecord = z.infer<typeof GuestTabRecordSchema>;

export const ShiftReconciliationRecordSchema = z.object({
  id: z.string().uuid(),
  shiftNumber: z.string(),
  serverId: z.string().uuid(),
  openingFloatUsd: z.number().nonnegative(),
  cashSalesUsd: z.number().nonnegative(),
  cardSalesUsd: z.number().nonnegative(),
  mobileSalesUsd: z.number().nonnegative(),
  expectedCashUsd: z.number().nonnegative(),
  countedCashUsd: z.number().nonnegative(),
  varianceUsd: z.number(),
  reconciledAt: z.string(),
});
export type ShiftReconciliationRecord = z.infer<typeof ShiftReconciliationRecordSchema>;

export const BarLoungeFinancialSummarySchema = z.object({
  totalTabsCount: z.number().int().nonnegative(),
  totalBeverageRevenueUsd: z.number().nonnegative(),
  totalFoodRevenueUsd: z.number().nonnegative(),
  totalRecipeCogsUsd: z.number().nonnegative(),
  grossMarginUsd: z.number(),
  grossMarginPct: z.number(),
  totalWastageCostUsd: z.number().nonnegative(),
});
export type BarLoungeFinancialSummary = z.infer<typeof BarLoungeFinancialSummarySchema>;
