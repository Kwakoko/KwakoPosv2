import { z } from "zod";

export const WholesaleUnitConversionRuleSchema = z.object({
  productId: z.string().uuid(),
  fromUnit: z.string(), // e.g. "CARTON"
  toUnit: z.string(),   // e.g. "PIECE"
  conversionFactor: z.number().positive(), // e.g. 24
});
export type WholesaleUnitConversionRule = z.infer<typeof WholesaleUnitConversionRuleSchema>;


export const CustomerSegmentSchema = z.enum([
  "DEALER",
  "DISTRIBUTOR",
  "CORPORATE",
  "SME",
  "RESELLER",
  "VIP",
  "NEW_ACCOUNT",
  "CREDIT_CUSTOMER",
  "CASH_CUSTOMER",
]);
export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;

export const CustomerCreditAccountSchema = z.object({
  customerId: z.string().uuid(),
  creditLimitUsd: z.number().nonnegative(),
  currentExposureUsd: z.number().nonnegative(),
  reservedExposureUsd: z.number().nonnegative().default(0),
  availableCreditUsd: z.number(), // Limit - Exposure - Reserved
  isCreditHold: z.boolean().default(false),
  creditTermsDays: z.number().int().default(30),
  paymentRating: z.enum(["EXCELLENT", "GOOD", "MODERATE_RISK", "HIGH_RISK"]),
});
export type CustomerCreditAccount = z.infer<typeof CustomerCreditAccountSchema>;

export const WholesalePricingTierSchema = z.object({
  productId: z.string().uuid(),
  minQuantity: z.number().positive(),
  maxQuantity: z.number().positive().optional(),
  unitPriceUsd: z.number().nonnegative(),
  customerSegment: CustomerSegmentSchema.optional(),
});
export type WholesalePricingTier = z.infer<typeof WholesalePricingTierSchema>;

export const SalesOrderItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  unitOfMeasure: z.string(), // e.g. "CARTON"
  quantityOrdered: z.number().positive(),
  quantityReserved: z.number().nonnegative().default(0),
  quantityPicked: z.number().nonnegative().default(0),
  quantityPacked: z.number().nonnegative().default(0),
  quantityDispatched: z.number().nonnegative().default(0),
  quantityDelivered: z.number().nonnegative().default(0),
  unitPriceUsd: z.number().nonnegative(),
  taxPct: z.number().min(0).default(0),
  discountUsd: z.number().min(0).default(0),
  totalUsd: z.number().nonnegative(),
});
export type SalesOrderItem = z.infer<typeof SalesOrderItemSchema>;

export const SalesOrderRecordSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  orderStatus: z.enum([
    "DRAFT",
    "CREDIT_APPROVED",
    "RESERVED",
    "PICKING",
    "PACKED",
    "DISPATCHED",
    "DELIVERED",
    "INVOICED",
    "CLOSED",
    "CANCELLED",
  ]),
  items: z.array(SalesOrderItemSchema),
  subtotalUsd: z.number().nonnegative(),
  taxTotalUsd: z.number().nonnegative(),
  discountTotalUsd: z.number().nonnegative(),
  freightCostUsd: z.number().nonnegative().default(0),
  grandTotalUsd: z.number().nonnegative(),
  creditValidationPassed: z.boolean(),
  createdAt: z.string(),
});
export type SalesOrderRecord = z.infer<typeof SalesOrderRecordSchema>;

export const DeliveryNoteRecordSchema = z.object({
  id: z.string().uuid(),
  deliveryNumber: z.string(),
  salesOrderId: z.string().uuid(),
  driverName: z.string(),
  vehicleRegistration: z.string(),
  dispatchedAt: z.string(),
  deliveredAt: z.string().optional(),
  customerSignatureUrl: z.string().optional(),
  proofOfDeliveryPhotos: z.array(z.string()).default([]),
  status: z.enum(["IN_TRANSIT", "DELIVERED", "PARTIALLY_DELIVERED", "FAILED"]),
});
export type DeliveryNoteRecord = z.infer<typeof DeliveryNoteRecordSchema>;

export const CustomerReturnRequestSchema = z.object({
  id: z.string().uuid(),
  salesOrderId: z.string().uuid(),
  customerId: z.string().uuid(),
  reason: z.enum(["DAMAGED", "WRONG_ITEM", "EXCESS_STOCK", "EXPIRED", "QUALITY_DEFECT"]),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive(),
      condition: z.enum(["RESTOCKABLE", "QUARANTINE", "SCRAP"]),
    })
  ),
  status: z.enum(["PENDING_INSPECTION", "APPROVED", "RESTOCKED", "REJECTED"]),
});
export type CustomerReturnRequest = z.infer<typeof CustomerReturnRequestSchema>;

export const WholesaleFinancialSummarySchema = z.object({
  totalOrdersCount: z.number().int().nonnegative(),
  totalWholesaleRevenueUsd: z.number().nonnegative(),
  totalCogsUsd: z.number().nonnegative(),
  totalFreightCostUsd: z.number().nonnegative(),
  grossProfitUsd: z.number(),
  marginPct: z.number(),
  totalAccountsReceivableUsd: z.number().nonnegative(),
  overdueReceivablesUsd: z.number().nonnegative(),
});
export type WholesaleFinancialSummary = z.infer<typeof WholesaleFinancialSummarySchema>;
