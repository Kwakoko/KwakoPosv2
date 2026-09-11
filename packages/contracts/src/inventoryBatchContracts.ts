import { z } from "zod";

export const BatchStatusEnum = z.enum(["ACTIVE", "EXPIRED", "DEPLETED", "QUARANTINED"]);
export type BatchStatus = z.infer<typeof BatchStatusEnum>;

export const BatchRiskLevelEnum = z.enum(["NORMAL", "EXPIRING_SOON", "EXPIRED"]);
export type BatchRiskLevel = z.infer<typeof BatchRiskLevelEnum>;

export const StockBatchSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
  batchNumber: z.string().min(1),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().min(1), // ISO Date string
  quantityReceived: z.number().nonnegative(),
  quantityRemaining: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  status: BatchStatusEnum.default("ACTIVE"),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StockBatch = z.infer<typeof StockBatchSchema>;

export const CreateBatchRequestSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  batchNumber: z.string().min(1),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateBatchRequest = z.infer<typeof CreateBatchRequestSchema>;

export const FefoPickRequestSchema = z.object({
  variantId: z.string().min(1),
  quantityRequested: z.number().positive(),
  referenceType: z.enum(["SALE", "DISPENSE", "PRODUCTION", "TRANSFER"]),
  referenceId: z.string().min(1),
});
export type FefoPickRequest = z.infer<typeof FefoPickRequestSchema>;

export const FefoAllocationSchema = z.object({
  batchId: z.string().uuid(),
  batchNumber: z.string(),
  expiryDate: z.string(),
  allocatedQuantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});
export type FefoAllocation = z.infer<typeof FefoAllocationSchema>;

export const FefoPickResultSchema = z.object({
  variantId: z.string(),
  quantityRequested: z.number(),
  totalAllocated: z.number(),
  unfulfilledQuantity: z.number(),
  allocations: z.array(FefoAllocationSchema),
  isFullyFulfilled: z.boolean(),
});
export type FefoPickResult = z.infer<typeof FefoPickResultSchema>;

export const BatchExpiryAlertSchema = z.object({
  batchId: z.string(),
  batchNumber: z.string(),
  variantId: z.string(),
  expiryDate: z.string(),
  daysUntilExpiry: z.number(),
  quantityRemaining: z.number(),
  riskLevel: BatchRiskLevelEnum,
});
export type BatchExpiryAlert = z.infer<typeof BatchExpiryAlertSchema>;
