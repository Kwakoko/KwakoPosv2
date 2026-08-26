import { z } from "zod";

// ==========================================
// Base & Security Context & RBAC
// ==========================================

export const CommercialPermissionEnum = z.enum([
  "PRODUCT_VIEW",
  "PRODUCT_CREATE",
  "PRODUCT_EDIT",
  "PRODUCT_ARCHIVE",
  "INVENTORY_VIEW",
  "INVENTORY_ADJUST",
  "INVENTORY_TRANSFER",
  "INVENTORY_COUNT",
  "PURCHASE_VIEW",
  "PURCHASE_CREATE",
  "PURCHASE_APPROVE",
  "PURCHASE_RECEIVE",
  "SALE_VIEW",
  "SALE_CREATE",
  "SALE_VOID",
  "SALE_RETURN",
  "PAYMENT_VIEW",
  "PAYMENT_CREATE",
  "PAYMENT_REFUND",
  "CUSTOMER_VIEW",
  "CUSTOMER_CREATE",
  "CUSTOMER_EDIT",
  "SUPPLIER_VIEW",
  "SUPPLIER_CREATE",
  "SUPPLIER_EDIT",
  "REPORT_VIEW",
  "REPORT_EXPORT",
  "SUPER_ADMIN_OPERATIONS",
]);
export type CommercialPermission = z.infer<typeof CommercialPermissionEnum>;

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
// Category & UnitOfMeasure Contracts
// ==========================================

export const CategorySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Category = z.infer<typeof CategorySchema>;

export const CreateCategoryRequestSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  parentId: z.string().uuid().optional(),
});
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;

export const UnitOfMeasureSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  name: z.string().min(1),
  symbol: z.string().min(1),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type UnitOfMeasure = z.infer<typeof UnitOfMeasureSchema>;

// ==========================================
// Customer & Supplier Contracts
// ==========================================

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  customerCode: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  creditLimit: z.number().nonnegative().default(0),
  currentBalance: z.number().default(0),
  openingBalance: z.number().default(0),
  status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerRequestSchema = z.object({
  id: z.string().uuid().optional(),
  customerCode: z.string().min(1).optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  openingBalance: z.number().optional(),
});
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;

export const UpdateCustomerRequestSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  supplierCode: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  taxPin: z.string().nullable().optional(),
  outstandingBalance: z.number().default(0),
  status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const CreateSupplierRequestSchema = z.object({
  id: z.string().uuid().optional(),
  supplierCode: z.string().min(1).optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  taxPin: z.string().optional(),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;

export const UpdateSupplierRequestSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  taxPin: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;

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
  categoryId: z.string().uuid().nullable().optional(),
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
  categoryId: z.string().uuid().optional(),
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
  categoryId: z.string().uuid().optional(),
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
// Purchasing Contracts (PO & Goods Receipt)
// ==========================================

export const PurchaseOrderStatusEnum = z.enum([
  "DRAFT",
  "APPROVED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusEnum>;

export const PurchaseOrderItemSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantityOrdered: z.number().positive(),
  quantityReceived: z.number().nonnegative().default(0),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
});
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  orderNumber: z.string(),
  supplierId: z.string().uuid(),
  status: PurchaseOrderStatusEnum,
  totalAmount: z.number().nonnegative(),
  notes: z.string().nullable().optional(),
  createdById: z.string().uuid().nullable().optional(),
  approvedById: z.string().uuid().nullable().optional(),
  orderedAt: z.string().or(z.date()),
  items: z.array(PurchaseOrderItemSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const CreatePurchaseOrderRequestSchema = z.object({
  supplierId: z.string().uuid(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      variantId: z.string().uuid(),
      quantityOrdered: z.number().positive(),
      unitCost: z.number().nonnegative(),
    })
  ).min(1),
});
export type CreatePurchaseOrderRequest = z.infer<typeof CreatePurchaseOrderRequestSchema>;

export const PurchaseReceiptItemSchema = z.object({
  id: z.string().uuid(),
  purchaseReceiptId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantityReceived: z.number().positive(),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  batchNumber: z.string().nullable().optional(),
  expiryDate: z.string().or(z.date()).nullable().optional(),
});
export type PurchaseReceiptItem = z.infer<typeof PurchaseReceiptItemSchema>;

export const PurchaseReceiptSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  receiptNumber: z.string(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid(),
  receivedAt: z.string().or(z.date()),
  createdById: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(PurchaseReceiptItemSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type PurchaseReceipt = z.infer<typeof PurchaseReceiptSchema>;

export const CreatePurchaseReceiptRequestSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  notes: z.string().optional(),
  deviceId: z.string().min(1),
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  items: z.array(
    z.object({
      variantId: z.string().uuid(),
      quantityReceived: z.number().positive(),
      unitCost: z.number().nonnegative(),
      batchNumber: z.string().optional(),
      expiryDate: z.string().optional(),
    })
  ).min(1),
});
export type CreatePurchaseReceiptRequest = z.infer<typeof CreatePurchaseReceiptRequestSchema>;

// ==========================================
// POS, Sale, & Return Contracts
// ==========================================

export const SaleLineSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  lineTotal: z.number().nonnegative(),
});
export type SaleLine = z.infer<typeof SaleLineSchema>;

export const SaleStatusEnum = z.enum(["COMPLETED", "CANCELLED", "REFUNDED"]);
export type SaleStatus = z.infer<typeof SaleStatusEnum>;

export const PaymentStatusEnum = z.enum(["PAID", "PARTIAL", "UNPAID"]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const PaymentMethodEnum = z.enum([
  "CASH",
  "CARD",
  "BANK",
  "MOBILE_MONEY",
  "CREDIT",
  "OTHER",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PaymentProviderEnum = z.enum([
  "MPESA",
  "AIRTEL_MONEY",
  "TIGO_PESA",
  "HALOPESA",
  "NMB",
  "CRDB",
  "CASH",
  "OTHER",
]);
export type PaymentProvider = z.infer<typeof PaymentProviderEnum>;

export const SaleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  saleNumber: z.string(),
  customerId: z.string().uuid().nullable().optional(),
  cashSessionId: z.string().uuid().nullable().optional(),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative().default(0),
  taxTotal: z.number().nonnegative().default(0),
  grandTotal: z.number().nonnegative(),
  totalCost: z.number().nonnegative().default(0),
  grossProfit: z.number().default(0),
  status: SaleStatusEnum,
  paymentStatus: PaymentStatusEnum,
  deviceId: z.string(),
  operationId: z.string(),
  idempotencyKey: z.string(),
  soldById: z.string().uuid().nullable().optional(),
  soldAt: z.string().or(z.date()),
  lines: z.array(SaleLineSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Sale = z.infer<typeof SaleSchema>;

export const CreatePosSaleRequestSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  cashSessionId: z.string().uuid().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      unitCost: z.number().nonnegative().optional(),
      discountAmount: z.number().nonnegative().optional(),
      taxAmount: z.number().nonnegative().optional(),
    })
  ).min(1),
  discountTotal: z.number().nonnegative().optional(),
  taxTotal: z.number().nonnegative().optional(),
  payments: z.array(
    z.object({
      amount: z.number().positive(),
      paymentMethod: PaymentMethodEnum,
      provider: PaymentProviderEnum.optional(),
      providerReference: z.string().optional(),
    })
  ).optional(),
  deviceId: z.string().min(1),
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});
export type CreatePosSaleRequest = z.infer<typeof CreatePosSaleRequestSchema>;

export const ReturnLineSchema = z.object({
  id: z.string().uuid(),
  returnId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantityReturned: z.number().positive(),
  refundUnitPrice: z.number().nonnegative(),
  refundLineTotal: z.number().nonnegative(),
  condition: z.enum(["GOOD", "DAMAGED", "DEFECTIVE"]).default("GOOD"),
});
export type ReturnLine = z.infer<typeof ReturnLineSchema>;

export const ReturnSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  returnNumber: z.string(),
  originalSaleId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  reason: z.string(),
  refundType: z.enum(["CASH", "STORE_CREDIT", "BANK", "MOBILE_MONEY"]).default("CASH"),
  totalRefundAmount: z.number().nonnegative(),
  status: z.enum(["COMPLETED", "REJECTED"]).default("COMPLETED"),
  authorizedById: z.string().uuid().nullable().optional(),
  lines: z.array(ReturnLineSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Return = z.infer<typeof ReturnSchema>;

export const CreateSaleReturnRequestSchema = z.object({
  originalSaleId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  reason: z.string().min(1),
  refundType: z.enum(["CASH", "STORE_CREDIT", "BANK", "MOBILE_MONEY"]).default("CASH"),
  deviceId: z.string().min(1),
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  items: z.array(
    z.object({
      variantId: z.string().uuid(),
      quantityReturned: z.number().positive(),
      refundUnitPrice: z.number().nonnegative(),
      condition: z.enum(["GOOD", "DAMAGED", "DEFECTIVE"]).default("GOOD"),
    })
  ).min(1),
});
export type CreateSaleReturnRequest = z.infer<typeof CreateSaleReturnRequestSchema>;

// ==========================================
// Payment Contracts
// ==========================================

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  paymentNumber: z.string(),
  saleId: z.string().uuid().nullable().optional(),
  purchaseReceiptId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  paymentMethod: PaymentMethodEnum,
  provider: PaymentProviderEnum.nullable().optional(),
  providerReference: z.string().nullable().optional(),
  status: z.enum(["COMPLETED", "PENDING", "FAILED", "REFUNDED"]),
  paidAt: z.string().or(z.date()),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const CreatePaymentRequestSchema = z.object({
  saleId: z.string().uuid().optional(),
  purchaseReceiptId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  amount: z.number().positive(),
  paymentMethod: PaymentMethodEnum,
  provider: PaymentProviderEnum.optional(),
  providerReference: z.string().optional(),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

// ==========================================
// Cash Session Contracts
// ==========================================

export const CashSessionStatusEnum = z.enum(["OPEN", "ACTIVE", "CLOSE_REQUESTED", "CLOSED"]);
export type CashSessionStatus = z.infer<typeof CashSessionStatusEnum>;

export const CashSessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  sessionNumber: z.string(),
  cashierId: z.string().uuid(),
  openedAt: z.string().or(z.date()),
  closedAt: z.string().or(z.date()).nullable().optional(),
  openingCash: z.number().nonnegative(),
  closingCash: z.number().nullable().optional(),
  expectedCash: z.number().default(0),
  actualCash: z.number().nullable().optional(),
  cashSalesTotal: z.number().default(0),
  cashRefundsTotal: z.number().default(0),
  cashExpensesTotal: z.number().default(0),
  variance: z.number().nullable().optional(),
  status: CashSessionStatusEnum,
  notes: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type CashSession = z.infer<typeof CashSessionSchema>;

export const OpenCashSessionRequestSchema = z.object({
  openingCash: z.number().nonnegative().default(0),
  notes: z.string().optional(),
});
export type OpenCashSessionRequest = z.infer<typeof OpenCashSessionRequestSchema>;

export const CloseCashSessionRequestSchema = z.object({
  actualCash: z.number().nonnegative(),
  notes: z.string().optional(),
});
export type CloseCashSessionRequest = z.infer<typeof CloseCashSessionRequestSchema>;

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  cashSessionId: z.string().uuid().nullable().optional(),
  category: z.string(),
  amount: z.number().positive(),
  reason: z.string(),
  authorizedById: z.string().uuid().nullable().optional(),
  incurredAt: z.string().or(z.date()),
  createdAt: z.string().or(z.date()),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const CreateExpenseRequestSchema = z.object({
  cashSessionId: z.string().uuid().optional(),
  category: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
});
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;

// ==========================================
// Commercial Reports & Executive Dashboard
// ==========================================

export const CommercialDashboardSummarySchema = z.object({
  todayRevenue: z.number(),
  todayGrossProfit: z.number(),
  todayTransactionCount: z.number(),
  totalOutstandingReceivables: z.number(),
  totalOutstandingPayables: z.number(),
  lowStockItemsCount: z.number(),
  topSellingProducts: z.array(
    z.object({
      variantId: z.string(),
      productName: z.string(),
      quantitySold: z.number(),
      revenue: z.number(),
    })
  ),
  cashDrawerPosition: z.number(),
});
export type CommercialDashboardSummary = z.infer<typeof CommercialDashboardSummarySchema>;

// ==========================================
// Sync Contracts
// ==========================================

export const SyncOperationTypeEnum = z.enum(["CREATE", "UPDATE", "DELETE"]);
export type SyncOperationType = z.infer<typeof SyncOperationTypeEnum>;

export const CommercialEntityTypeEnum = z.enum([
  "Product",
  "ProductVariant",
  "StockAdjustment",
  "StockLedger",
  "Customer",
  "Supplier",
  "Sale",
  "PurchaseOrder",
  "PurchaseReceipt",
  "Payment",
  "CashSession",
]);
export type CommercialEntityType = z.infer<typeof CommercialEntityTypeEnum>;

export const SyncOperationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  deviceId: z.string(),
  operationId: z.string(),
  entityType: CommercialEntityTypeEnum,
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
      entityType: CommercialEntityTypeEnum,
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
  customers: z.array(CustomerSchema).optional(),
  suppliers: z.array(SupplierSchema).optional(),
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