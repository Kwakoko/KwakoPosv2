import { z } from "zod";

// ==========================================
// Base & Security Context
// ==========================================

export const TenantContextSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const UserRoleEnum = z.enum(["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "AUDITOR"]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  deviceId: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    branchId: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    role: z.string(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
  deviceId: z.string().min(1),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const RefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

// ==========================================
// Tenant & Branch Contracts
// ==========================================

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const BranchSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  isMain: z.boolean().default(false),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Branch = z.infer<typeof BranchSchema>;

export const CreateBranchRequestSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  isMain: z.boolean().optional(),
});
export type CreateBranchRequest = z.infer<typeof CreateBranchRequestSchema>;

// ==========================================
// Product & ProductVariant Contracts
// ==========================================

export const ProductVariantSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().nullable().optional(),
  price: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  isActive: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sku: z.string().min(1),
  category: z.string().default("General"),
  isActive: z.boolean().default(true),
  variants: z.array(ProductVariantSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateVariantRequestSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  price: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  isActive: z.boolean().optional(),
});
export type CreateVariantRequest = z.infer<typeof CreateVariantRequestSchema>;

export const CreateProductRequestSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().min(1),
  category: z.string().optional(),
  variants: z.array(CreateVariantRequestSchema).optional(),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sku: z.string().min(1).optional(),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const UpdateVariantRequestSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().min(1).optional(),
  barcode: z.string().optional(),
  price: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateVariantRequest = z.infer<typeof UpdateVariantRequestSchema>;

// ==========================================
// StockLedger & StockAdjustment Contracts
// ==========================================

export const StockMovementTypeEnum = z.enum([
  "OPENING",
  "PURCHASE",
  "SALE",
  "ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN",
  "DAMAGE",
]);
export type StockMovementType = z.infer<typeof StockMovementTypeEnum>;

export const StockLedgerSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  movementType: StockMovementTypeEnum,
  quantity: z.number(),
  referenceType: z.string(),
  referenceId: z.string().uuid().nullable().optional(),
  occurredAt: z.string().or(z.date()),
  deviceId: z.string(),
  operationId: z.string(),
  idempotencyKey: z.string(),
  createdAt: z.string().or(z.date()),
});
export type StockLedger = z.infer<typeof StockLedgerSchema>;

export const StockAdjustmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  variantId: z.string().uuid(),
  adjustmentType: z.enum(["INCREASE", "DECREASE", "SET"]),
  quantityChange: z.number(),
  reason: z.string(),
  referenceNote: z.string().nullable().optional(),
  status: z.enum(["COMPLETED", "REJECTED"]).default("COMPLETED"),
  createdByUserId: z.string().uuid(),
  deviceId: z.string(),
  operationId: z.string(),
  idempotencyKey: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type StockAdjustment = z.infer<typeof StockAdjustmentSchema>;

export const CreateStockAdjustmentRequestSchema = z.object({
  id: z.string().uuid().optional(),
  variantId: z.string().uuid(),
  adjustmentType: z.enum(["INCREASE", "DECREASE", "SET"]),
  quantityChange: z.number(),
  reason: z.string().min(1),
  referenceNote: z.string().optional(),
  deviceId: z.string().min(1),
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});
export type CreateStockAdjustmentRequest = z.infer<typeof CreateStockAdjustmentRequestSchema>;

// ==========================================
// Sync Contracts
// ==========================================

export const SyncOperationTypeEnum = z.enum(["CREATE", "UPDATE", "DELETE"]);
export type SyncOperationType = z.infer<typeof SyncOperationTypeEnum>;

export const SyncOperationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  deviceId: z.string(),
  operationId: z.string(),
  entityType: z.enum(["Product", "ProductVariant", "StockAdjustment", "StockLedger"]),
  entityId: z.string(),
  operationType: SyncOperationTypeEnum,
  payload: z.record(z.unknown()),
  status: z.enum(["PENDING", "PROCESSED", "FAILED"]).default("PROCESSED"),
  idempotencyKey: z.string(),
  clientCreatedAt: z.string().or(z.date()),
  processedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  operations: z.array(
    z.object({
      operationId: z.string().min(1),
      entityType: z.enum(["Product", "ProductVariant", "StockAdjustment", "StockLedger"]),
      entityId: z.string().min(1),
      operationType: SyncOperationTypeEnum,
      payload: z.record(z.unknown()),
      clientCreatedAt: z.string(),
      idempotencyKey: z.string().min(1),
    })
  ),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SyncPushResponseSchema = z.object({
  processedCount: z.number(),
  results: z.array(
    z.object({
      operationId: z.string(),
      idempotencyKey: z.string(),
      status: z.enum(["SUCCESS", "ALREADY_PROCESSED", "FAILED"]),
      error: z.string().optional(),
    })
  ),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

export const SyncDeltaRequestSchema = z.object({
  since: z.string().optional(),
  limit: z.number().optional().default(100),
});
export type SyncDeltaRequest = {
  since?: string;
  limit?: number;
};

export const SyncDeltaResponseSchema = z.object({
  serverTimestamp: z.string(),
  products: z.array(ProductSchema),
  variants: z.array(ProductVariantSchema),
  stockLedger: z.array(StockLedgerSchema),
  adjustments: z.array(StockAdjustmentSchema),
});
export type SyncDeltaResponse = z.infer<typeof SyncDeltaResponseSchema>;

// ==========================================
// Health & Version Contracts
// ==========================================

export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  uptime: z.number(),
  database: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const VersionResponseSchema = z.object({
  version: z.string(),
  gitSha: z.string(),
  containerDigest: z.string(),
  cloudRunRevision: z.string(),
});
export type VersionResponse = z.infer<typeof VersionResponseSchema>;

// ==========================================
// Standard API Envelope
// ==========================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.any().optional(),
      })
      .optional(),
  });
