import { z } from "zod";

// =========================================================================
// 1. Plan & Tier Contracts
// =========================================================================

export const BillingIntervalEnum = z.enum(["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]);
export type BillingInterval = z.infer<typeof BillingIntervalEnum>;

export const PlanTierEnum = z.enum(["STARTER", "BUSINESS", "PROFESSIONAL", "ENTERPRISE", "CUSTOM"]);
export type PlanTier = z.infer<typeof PlanTierEnum>;

export const PlanStatusEnum = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type PlanStatus = z.infer<typeof PlanStatusEnum>;

export const PlanLimitSchema = z.object({
  userLimit: z.number().int().nonnegative(),
  branchLimit: z.number().int().nonnegative(),
  transactionLimit: z.number().int().nonnegative(),
  storageMbLimit: z.number().int().nonnegative(),
  apiCallsLimit: z.number().int().nonnegative(),
  customLimits: z.record(z.number()).optional(),
});
export type PlanLimit = z.infer<typeof PlanLimitSchema>;

export const PlanSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  tier: PlanTierEnum,
  version: z.number().int().positive().default(1),
  description: z.string().nullable().optional(),
  status: PlanStatusEnum.default("ACTIVE"),
  billingInterval: BillingIntervalEnum.default("MONTHLY"),
  currency: z.string().default("TZS"),
  basePrice: z.number().nonnegative(),
  annualDiscountPct: z.number().min(0).max(100).default(0),
  trialEligibility: z.boolean().default(true),
  trialDays: z.number().int().nonnegative().default(14),
  limits: PlanLimitSchema,
  featureEntitlements: z.array(z.string()),
  industryEntitlements: z.array(z.string()),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Plan = z.infer<typeof PlanSchema>;

export const CreatePlanRequestSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  tier: PlanTierEnum,
  description: z.string().optional(),
  billingInterval: BillingIntervalEnum.optional(),
  currency: z.string().optional(),
  basePrice: z.number().nonnegative(),
  annualDiscountPct: z.number().min(0).max(100).optional(),
  trialEligibility: z.boolean().optional(),
  trialDays: z.number().int().nonnegative().optional(),
  limits: PlanLimitSchema,
  featureEntitlements: z.array(z.string()),
  industryEntitlements: z.array(z.string()),
});
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>;

export const UpdatePlanRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  basePrice: z.number().nonnegative().optional(),
  annualDiscountPct: z.number().min(0).max(100).optional(),
  status: PlanStatusEnum.optional(),
  limits: PlanLimitSchema.optional(),
  featureEntitlements: z.array(z.string()).optional(),
  industryEntitlements: z.array(z.string()).optional(),
});
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequestSchema>;

// =========================================================================
// 2. Subscription Lifecycle Contracts
// =========================================================================

export const SubscriptionStatusEnum = z.enum([
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

export const SubscriptionItemSchema = z.object({
  id: z.string().uuid(),
  itemType: z.enum(["BASE_PLAN", "ADDON", "PLUGIN", "EXTRA_USERS", "EXTRA_BRANCHES", "EXTRA_STORAGE"]),
  code: z.string(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative(),
  currency: z.string().default("TZS"),
});
export type SubscriptionItem = z.infer<typeof SubscriptionItemSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  planCode: z.string(),
  planVersion: z.number().int().positive(),
  status: SubscriptionStatusEnum,
  currency: z.string().default("TZS"),
  basePrice: z.number().nonnegative(),
  currentPeriodPrice: z.number().nonnegative(),
  billingInterval: BillingIntervalEnum,
  items: z.array(SubscriptionItemSchema).default([]),
  startDate: z.string(),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  trialEnd: z.string().nullable().optional(),
  gracePeriodEnd: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  cancelReason: z.string().nullable().optional(),
  autoRenew: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const CreateSubscriptionRequestSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  billingInterval: BillingIntervalEnum.default("MONTHLY"),
  currency: z.string().default("TZS"),
  startTrial: z.boolean().default(true),
  customTrialDays: z.number().int().optional(),
  autoRenew: z.boolean().default(true),
  items: z.array(SubscriptionItemSchema).optional(),
});
export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;

export const ChangePlanRequestSchema = z.object({
  targetPlanId: z.string().uuid(),
  immediate: z.boolean().default(true),
  prorate: z.boolean().default(true),
  reason: z.string().optional(),
});
export type ChangePlanRequest = z.infer<typeof ChangePlanRequestSchema>;

// =========================================================================
// 3. Entitlement & Protected Feature Contracts
// =========================================================================

export const EntitlementResultCodeEnum = z.enum([
  "ALLOWED",
  "DENIED",
  "LIMIT_REACHED",
  "SUBSCRIPTION_INACTIVE",
  "TRIAL_EXPIRED",
]);
export type EntitlementResultCode = z.infer<typeof EntitlementResultCodeEnum>;

export const EntitlementCheckResponseSchema = z.object({
  allowed: z.boolean(),
  resultCode: EntitlementResultCodeEnum,
  featureKey: z.string(),
  tenantId: z.string().uuid(),
  currentUsage: z.number().optional(),
  limit: z.number().optional(),
  message: z.string(),
});
export type EntitlementCheckResponse = z.infer<typeof EntitlementCheckResponseSchema>;

// =========================================================================
// 4. Usage Metering Contracts
// =========================================================================

export const MeterTypeEnum = z.enum([
  "USERS",
  "BRANCHES",
  "SALES_TRANSACTIONS",
  "PURCHASE_TRANSACTIONS",
  "INVOICES",
  "API_CALLS",
  "STORAGE_MB",
  "FILE_UPLOADS",
  "AI_TOKENS",
  "SMS_MESSAGES",
  "TELECOM_SITES",
  "RESTAURANT_TABLES",
]);
export type MeterType = z.infer<typeof MeterTypeEnum>;

export const MeterEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  meterType: MeterTypeEnum,
  quantity: z.number(),
  source: z.string(),
  operationId: z.string(),
  idempotencyKey: z.string(),
  occurredAt: z.string(),
  createdAt: z.string().or(z.date()),
});
export type MeterEvent = z.infer<typeof MeterEventSchema>;

export const RecordUsageRequestSchema = z.object({
  tenantId: z.string().uuid(),
  meterType: MeterTypeEnum,
  quantity: z.number().positive(),
  source: z.string().min(1),
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  occurredAt: z.string().optional(),
});
export type RecordUsageRequest = z.infer<typeof RecordUsageRequestSchema>;

export const UsageAggregateSchema = z.object({
  tenantId: z.string().uuid(),
  meterType: MeterTypeEnum,
  periodKey: z.string(), // e.g. "2026-08"
  totalQuantity: z.number(),
  limit: z.number().optional(),
  remaining: z.number().optional(),
  overageQuantity: z.number().default(0),
  overageRate: z.number().default(0),
  overageChargeTotal: z.number().default(0),
});
export type UsageAggregate = z.infer<typeof UsageAggregateSchema>;

// =========================================================================
// 5. Invoicing & Billing Engine Contracts
// =========================================================================

export const InvoiceStatusEnum = z.enum(["DRAFT", "OPEN", "PAST_DUE", "PAID", "VOID", "UNCOLLECTIBLE"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const BillingInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  itemType: z.enum(["PLAN_SUBSCRIPTION", "USAGE_OVERAGE", "ADDON", "PLUGIN", "DISCOUNT", "TAX"]),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
  discountAmount: z.number().default(0),
  taxAmount: z.number().default(0),
  total: z.number(),
});
export type BillingInvoiceLine = z.infer<typeof BillingInvoiceLineSchema>;

export const BillingInvoiceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  invoiceNumber: z.string(),
  billingPeriodStart: z.string(),
  billingPeriodEnd: z.string(),
  currency: z.string().default("TZS"),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative().default(0),
  taxTotal: z.number().nonnegative().default(0),
  grandTotal: z.number().nonnegative(),
  amountPaid: z.number().nonnegative().default(0),
  balanceDue: z.number().nonnegative(),
  status: InvoiceStatusEnum,
  dueDate: z.string(),
  paidAt: z.string().nullable().optional(),
  lines: z.array(BillingInvoiceLineSchema),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type BillingInvoice = z.infer<typeof BillingInvoiceSchema>;

// =========================================================================
// 6. Payment Collection & Provider Adapter Contracts
// =========================================================================

export const PaymentProviderEnum = z.enum([
  "MPESA",
  "AIRTEL_MONEY",
  "TIGO_PESA",
  "HALOPESA",
  "BANK_TRANSFER",
  "STRIPE",
  "PAYPAL",
  "MANUAL",
]);
export type PaymentProvider = z.infer<typeof PaymentProviderEnum>;

export const PaymentStatusEnum = z.enum(["INITIATED", "PENDING", "SUCCESS", "FAILED", "REVERSED", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const BillingPaymentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  provider: PaymentProviderEnum,
  providerReference: z.string().nullable().optional(),
  amount: z.number().positive(),
  currency: z.string().default("TZS"),
  status: PaymentStatusEnum,
  idempotencyKey: z.string(),
  payerPhoneOrEmail: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
  reconciledAt: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type BillingPayment = z.infer<typeof BillingPaymentSchema>;

export const ProcessPaymentRequestSchema = z.object({
  tenantId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  provider: PaymentProviderEnum,
  amount: z.number().positive(),
  currency: z.string().default("TZS"),
  payerPhoneOrEmail: z.string().min(1),
  idempotencyKey: z.string().min(1),
  providerReference: z.string().optional(),
});
export type ProcessPaymentRequest = z.infer<typeof ProcessPaymentRequestSchema>;

// =========================================================================
// 7. Discounts, Coupons & Promotions
// =========================================================================

export const CouponSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(3).toUpperCase(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  currency: z.string().default("TZS"),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  redemptionCount: z.number().int().default(0),
  validFrom: z.string(),
  validUntil: z.string(),
  isActive: z.boolean().default(true),
  applicablePlanCodes: z.array(z.string()).optional(),
});
export type Coupon = z.infer<typeof CouponSchema>;

// =========================================================================
// 8. SaaS Analytics, KPIs & Dashboard Contracts
// =========================================================================

export const SaaSKpiMetricsSchema = z.object({
  mrr: z.number().nonnegative(),
  arr: z.number().nonnegative(),
  arpu: z.number().nonnegative(),
  totalTenants: z.number().int().nonnegative(),
  activeSubscribers: z.number().int().nonnegative(),
  trialTenants: z.number().int().nonnegative(),
  trialConversionRatePct: z.number().min(0).max(100),
  grossChurnRatePct: z.number().min(0).max(100),
  netRevenueRetentionPct: z.number().nonnegative(),
  paymentSuccessRatePct: z.number().min(0).max(100),
  pluginRevenueMonthly: z.number().nonnegative(),
  usageRevenueMonthly: z.number().nonnegative(),
});
export type SaaSKpiMetrics = z.infer<typeof SaaSKpiMetricsSchema>;
