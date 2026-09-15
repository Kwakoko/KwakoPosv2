import { z } from "zod";

export const StockCountStatusEnum = z.enum([
  "DRAFT",
  "COUNTING",
  "RECONCILING",
  "APPROVED",
  "POSTED",
  "CANCELLED",
]);
export type StockCountStatus = z.infer<typeof StockCountStatusEnum>;

export const StockCountScopeEnum = z.enum([
  "FULL_STORE",
  "CATEGORY",
  "LOCATION",
  "CYCLIC_SAMPLE",
]);
export type StockCountScope = z.infer<typeof StockCountScopeEnum>;

export const StockCountLineSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  productId: z.string().min(1),
  variantId: z.string().min(1),
  sku: z.string().min(1),
  productName: z.string().min(1),
  systemQuantity: z.number(),
  countedQuantity: z.number().nullable(),
  varianceQuantity: z.number().default(0),
  varianceValue: z.number().default(0),
  unitCost: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  countedByUserId: z.string().optional(),
  countedAt: z.string().optional(),
});
export type StockCountLine = z.infer<typeof StockCountLineSchema>;

export const StockCountSessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  sessionNumber: z.string().min(1),
  name: z.string().min(1),
  scope: StockCountScopeEnum,
  status: StockCountStatusEnum.default("DRAFT"),
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  lines: z.array(StockCountLineSchema).default([]),
  totalItemsCounted: z.number().default(0),
  totalDiscrepantItems: z.number().default(0),
  netVarianceQuantity: z.number().default(0),
  netVarianceValue: z.number().default(0),
  startedAt: z.string().optional(),
  reconciledAt: z.string().optional(),
  postedAt: z.string().optional(),
  createdById: z.string().min(1),
  approvedById: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StockCountSession = z.infer<typeof StockCountSessionSchema>;

export const StartStockCountRequestSchema = z.object({
  name: z.string().min(1),
  scope: StockCountScopeEnum.default("FULL_STORE"),
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  notes: z.string().optional(),
});
export type StartStockCountRequest = z.infer<typeof StartStockCountRequestSchema>;

export const RecordCountItemRequestSchema = z.object({
  variantId: z.string().min(1),
  countedQuantity: z.number().nonnegative(),
  notes: z.string().optional(),
});
export type RecordCountItemRequest = z.infer<typeof RecordCountItemRequestSchema>;

export const ReconcileStockCountRequestSchema = z.object({
  autoAdjustLedger: z.boolean().default(true),
  adjustmentReason: z.string().min(1).default("Physical cycle count variance reconciliation"),
  notes: z.string().optional(),
});
export type ReconcileStockCountRequest = z.infer<typeof ReconcileStockCountRequestSchema>;
