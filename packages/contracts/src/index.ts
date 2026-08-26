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
  "FINANCE_VIEW",
  "FINANCE_CREATE",
  "JOURNAL_CREATE",
  "JOURNAL_POST",
  "JOURNAL_REVERSE",
  "AR_VIEW",
  "AR_MANAGE",
  "AP_VIEW",
  "AP_MANAGE",
  "PAYMENT_RECONCILE",
  "BANK_RECONCILE",
  "CASH_RECONCILE",
  "BUDGET_VIEW",
  "BUDGET_MANAGE",
  "PERIOD_CLOSE",
  "PERIOD_REOPEN",
  "FINANCIAL_REPORT_VIEW",
  "FINANCIAL_REPORT_EXPORT",
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

// ==========================================
// PHASE 2: FINANCE & OPERATIONAL CONTROL CONTRACTS
// ==========================================

export const AccountClassEnum = z.enum([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "COGS",
  "EXPENSE",
  "OTHER_INCOME",
  "OTHER_EXPENSE",
]);
export type AccountClass = z.infer<typeof AccountClassEnum>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  accountCode: z.string().min(1),
  name: z.string().min(1),
  accountClass: AccountClassEnum,
  accountGroup: z.string().min(1),
  currency: z.string().default("TZS"),
  isSystem: z.boolean().default(false),
  isActive: z.boolean().default(true),
  currentBalance: z.number().default(0),
  description: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Account = z.infer<typeof AccountSchema>;

export const CreateAccountRequestSchema = z.object({
  id: z.string().uuid().optional(),
  accountCode: z.string().min(1),
  name: z.string().min(1),
  accountClass: AccountClassEnum,
  accountGroup: z.string().min(1),
  currency: z.string().default("TZS").optional(),
  description: z.string().optional(),
  branchId: z.string().uuid().optional(),
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequestSchema>;

export const UpdateAccountRequestSchema = z.object({
  name: z.string().min(1).optional(),
  accountGroup: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequestSchema>;

// Fiscal Year & Accounting Period
export const FiscalYearSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  status: z.enum(["OPEN", "CLOSING", "CLOSED", "LOCKED"]).default("OPEN"),
  isClosed: z.boolean().default(false),
  closedAt: z.string().or(z.date()).nullable().optional(),
  closedById: z.string().uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type FiscalYear = z.infer<typeof FiscalYearSchema>;

export const CreateFiscalYearRequestSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});
export type CreateFiscalYearRequest = z.infer<typeof CreateFiscalYearRequestSchema>;

export const AccountingPeriodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  fiscalYearId: z.string().uuid(),
  periodNumber: z.number().int().min(1).max(12),
  name: z.string().min(1),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  status: z.enum(["OPEN", "CLOSING", "CLOSED", "LOCKED"]).default("OPEN"),
  closedAt: z.string().or(z.date()).nullable().optional(),
  closedById: z.string().uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AccountingPeriod = z.infer<typeof AccountingPeriodSchema>;

export const CreateAccountingPeriodRequestSchema = z.object({
  fiscalYearId: z.string().uuid(),
  periodNumber: z.number().int().min(1).max(12),
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});
export type CreateAccountingPeriodRequest = z.infer<typeof CreateAccountingPeriodRequestSchema>;

// Journal Entry & Lines
export const JournalLineSchema = z.object({
  id: z.string().uuid(),
  journalEntryId: z.string().uuid(),
  accountId: z.string().uuid(),
  accountCode: z.string().optional(),
  accountName: z.string().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  currency: z.string().default("TZS"),
  exchangeRate: z.number().positive().default(1.0),
});
export type JournalLine = z.infer<typeof JournalLineSchema>;

export const JournalEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  accountingPeriodId: z.string().uuid().nullable().optional(),
  journalNumber: z.string(),
  entryDate: z.string().or(z.date()),
  postingDate: z.string().or(z.date()),
  sourceType: z.enum([
    "SALE",
    "PURCHASE",
    "PAYMENT",
    "EXPENSE",
    "RETURN",
    "TRANSFER",
    "CASH_SESSION",
    "MANUAL",
    "REVERSAL",
  ]),
  sourceId: z.string().nullable().optional(),
  description: z.string(),
  currency: z.string().default("TZS"),
  exchangeRate: z.number().positive().default(1.0),
  totalDebit: z.number().nonnegative(),
  totalCredit: z.number().nonnegative(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"]).default("POSTED"),
  isReversal: z.boolean().default(false),
  reversalOfJournalId: z.string().uuid().nullable().optional(),
  reversalReason: z.string().nullable().optional(),
  createdById: z.string().uuid().nullable().optional(),
  postedById: z.string().uuid().nullable().optional(),
  postedAt: z.string().or(z.date()).nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  lines: z.array(JournalLineSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const CreateJournalEntryRequestSchema = z.object({
  id: z.string().uuid().optional(),
  accountingPeriodId: z.string().uuid().optional(),
  entryDate: z.string().optional(),
  sourceType: z.enum([
    "SALE",
    "PURCHASE",
    "PAYMENT",
    "EXPENSE",
    "RETURN",
    "TRANSFER",
    "CASH_SESSION",
    "MANUAL",
    "REVERSAL",
  ]).default("MANUAL"),
  sourceId: z.string().optional(),
  description: z.string().min(1),
  currency: z.string().default("TZS").optional(),
  exchangeRate: z.number().positive().default(1.0).optional(),
  idempotencyKey: z.string().optional(),
  lines: z.array(
    z.object({
      accountId: z.string().uuid(),
      costCenterId: z.string().uuid().optional(),
      description: z.string().optional(),
      debit: z.number().nonnegative().default(0),
      credit: z.number().nonnegative().default(0),
    })
  ).min(2),
});
export type CreateJournalEntryRequest = z.infer<typeof CreateJournalEntryRequestSchema>;

export const ReverseJournalEntryRequestSchema = z.object({
  reason: z.string().min(1),
  reversalDate: z.string().optional(),
});
export type ReverseJournalEntryRequest = z.infer<typeof ReverseJournalEntryRequestSchema>;

// Customer Invoice & Receivables
export const CustomerInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  customerInvoiceId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  lineTotal: z.number().nonnegative(),
});
export type CustomerInvoiceLine = z.infer<typeof CustomerInvoiceLineSchema>;

export const CustomerInvoiceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  saleId: z.string().uuid().nullable().optional(),
  invoiceNumber: z.string(),
  invoiceDate: z.string().or(z.date()),
  dueDate: z.string().or(z.date()),
  subtotal: z.number().nonnegative(),
  taxTotal: z.number().nonnegative().default(0),
  discountTotal: z.number().nonnegative().default(0),
  grandTotal: z.number().nonnegative(),
  amountPaid: z.number().nonnegative().default(0),
  balanceDue: z.number().nonnegative(),
  status: z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]).default("ISSUED"),
  notes: z.string().nullable().optional(),
  lines: z.array(CustomerInvoiceLineSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type CustomerInvoice = z.infer<typeof CustomerInvoiceSchema>;

export const CreateCustomerInvoiceRequestSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  saleId: z.string().uuid().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      variantId: z.string().uuid().optional(),
      description: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      taxRate: z.number().nonnegative().optional(),
      discountAmount: z.number().nonnegative().optional(),
    })
  ).min(1),
});
export type CreateCustomerInvoiceRequest = z.infer<typeof CreateCustomerInvoiceRequestSchema>;

// Supplier Invoice & Payables
export const SupplierInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  supplierInvoiceId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  description: z.string(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  taxRate: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  lineTotal: z.number().nonnegative(),
});
export type SupplierInvoiceLine = z.infer<typeof SupplierInvoiceLineSchema>;

export const SupplierInvoiceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  purchaseReceiptId: z.string().uuid().nullable().optional(),
  invoiceNumber: z.string(),
  invoiceDate: z.string().or(z.date()),
  dueDate: z.string().or(z.date()),
  subtotal: z.number().nonnegative(),
  taxTotal: z.number().nonnegative().default(0),
  grandTotal: z.number().nonnegative(),
  amountPaid: z.number().nonnegative().default(0),
  balanceDue: z.number().nonnegative(),
  status: z.enum(["RECEIVED", "APPROVED", "PARTIALLY_PAID", "PAID", "OVERDUE", "REJECTED"]).default("RECEIVED"),
  notes: z.string().nullable().optional(),
  lines: z.array(SupplierInvoiceLineSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type SupplierInvoice = z.infer<typeof SupplierInvoiceSchema>;

export const CreateSupplierInvoiceRequestSchema = z.object({
  id: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  purchaseReceiptId: z.string().uuid().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      variantId: z.string().uuid().optional(),
      description: z.string().min(1),
      quantity: z.number().positive(),
      unitCost: z.number().nonnegative(),
      taxRate: z.number().nonnegative().optional(),
    })
  ).min(1),
});
export type CreateSupplierInvoiceRequest = z.infer<typeof CreateSupplierInvoiceRequestSchema>;

// Payment Allocation
export const PaymentAllocationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  paymentId: z.string().uuid(),
  customerInvoiceId: z.string().uuid().nullable().optional(),
  supplierInvoiceId: z.string().uuid().nullable().optional(),
  allocatedAmount: z.number().positive(),
  allocatedAt: z.string().or(z.date()),
  createdById: z.string().uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type PaymentAllocation = z.infer<typeof PaymentAllocationSchema>;

export const AllocatePaymentRequestSchema = z.object({
  paymentId: z.string().uuid(),
  customerInvoiceId: z.string().uuid().optional(),
  supplierInvoiceId: z.string().uuid().optional(),
  amount: z.number().positive(),
});
export type AllocatePaymentRequest = z.infer<typeof AllocatePaymentRequestSchema>;

// Bank Accounts & Transactions
export const BankAccountSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  currency: z.string().default("TZS"),
  openingBalance: z.number().default(0),
  currentBalance: z.number().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type BankAccount = z.infer<typeof BankAccountSchema>;

export const CreateBankAccountRequestSchema = z.object({
  id: z.string().uuid().optional(),
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  currency: z.string().default("TZS").optional(),
  openingBalance: z.number().default(0).optional(),
});
export type CreateBankAccountRequest = z.infer<typeof CreateBankAccountRequestSchema>;

export const BankTransactionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  transactionDate: z.string().or(z.date()),
  transactionType: z.enum([
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "FEE",
    "INTEREST",
    "ADJUSTMENT",
  ]),
  amount: z.number(),
  reference: z.string().min(1),
  description: z.string().nullable().optional(),
  reconciled: z.boolean().default(false),
  reconciledAt: z.string().or(z.date()).nullable().optional(),
  matchedJournalLineId: z.string().uuid().nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type BankTransaction = z.infer<typeof BankTransactionSchema>;

export const CreateBankTransactionRequestSchema = z.object({
  id: z.string().uuid().optional(),
  transactionDate: z.string().optional(),
  transactionType: z.enum([
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "FEE",
    "INTEREST",
    "ADJUSTMENT",
  ]),
  amount: z.number(),
  reference: z.string().min(1),
  description: z.string().optional(),
});
export type CreateBankTransactionRequest = z.infer<typeof CreateBankTransactionRequestSchema>;

// Budget
export const BudgetLineSchema = z.object({
  id: z.string().uuid(),
  budgetId: z.string().uuid(),
  accountId: z.string().uuid(),
  accountCode: z.string().optional(),
  accountName: z.string().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  budgetedAmount: z.number().nonnegative(),
  actualAmount: z.number().default(0),
  varianceAmount: z.number().default(0),
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  name: z.string().min(1),
  fiscalYear: z.string().min(1),
  period: z.string().nullable().optional(),
  totalBudget: z.number().nonnegative(),
  status: z.enum(["DRAFT", "APPROVED", "ARCHIVED"]).default("APPROVED"),
  lines: z.array(BudgetLineSchema).optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const CreateBudgetRequestSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  fiscalYear: z.string().min(1),
  period: z.string().optional(),
  lines: z.array(
    z.object({
      accountId: z.string().uuid(),
      costCenterId: z.string().uuid().optional(),
      budgetedAmount: z.number().nonnegative(),
    })
  ).min(1),
});
export type CreateBudgetRequest = z.infer<typeof CreateBudgetRequestSchema>;

// Financial Reports & Aging
export const AgingBucketSchema = z.object({
  current: z.number().default(0),
  days1To30: z.number().default(0),
  days31To60: z.number().default(0),
  days61To90: z.number().default(0),
  days90Plus: z.number().default(0),
  total: z.number().default(0),
});
export type AgingBucket = z.infer<typeof AgingBucketSchema>;

export const AgingReportItemSchema = z.object({
  entityId: z.string().uuid(),
  entityName: z.string(),
  entityCode: z.string(),
  buckets: AgingBucketSchema,
});
export type AgingReportItem = z.infer<typeof AgingReportItemSchema>;

export const AgingReportSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  reportType: z.enum(["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"]),
  asOfDate: z.string(),
  totalOutstanding: z.number(),
  summary: AgingBucketSchema,
  items: z.array(AgingReportItemSchema),
});
export type AgingReport = z.infer<typeof AgingReportSchema>;

export const ProfitAndLossReportSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  periodName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  revenue: z.object({
    retailSales: z.number(),
    wholesaleSales: z.number(),
    serviceRevenue: z.number(),
    discounts: z.number(),
    totalRevenue: z.number(),
  }),
  costOfGoodsSold: z.object({
    directCogs: z.number(),
    shrinkageLoss: z.number(),
    totalCogs: z.number(),
  }),
  grossProfit: z.number(),
  grossMarginPct: z.number(),
  operatingExpenses: z.object({
    rent: z.number(),
    utilities: z.number(),
    salaries: z.number(),
    officeSupplies: z.number(),
    miscExpenses: z.number(),
    totalOperatingExpenses: z.number(),
  }),
  operatingProfit: z.number(),
  operatingMarginPct: z.number(),
  otherIncome: z.number(),
  otherExpenses: z.number(),
  netProfit: z.number(),
  netMarginPct: z.number(),
});
export type ProfitAndLossReport = z.infer<typeof ProfitAndLossReportSchema>;

export const BalanceSheetReportSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  asOfDate: z.string(),
  assets: z.object({
    cashOnHand: z.number(),
    bankBalances: z.number(),
    accountsReceivable: z.number(),
    inventoryValuation: z.number(),
    totalCurrentAssets: z.number(),
    totalAssets: z.number(),
  }),
  liabilities: z.object({
    accountsPayable: z.number(),
    vatPayable: z.number(),
    customerAdvances: z.number(),
    totalCurrentLiabilities: z.number(),
    totalLiabilities: z.number(),
  }),
  equity: z.object({
    ownerCapital: z.number(),
    retainedEarnings: z.number(),
    currentPeriodNetProfit: z.number(),
    totalEquity: z.number(),
  }),
  isBalanced: z.boolean(),
  balanceCheckDifference: z.number(),
});
export type BalanceSheetReport = z.infer<typeof BalanceSheetReportSchema>;

export const TrialBalanceReportItemSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  accountClass: AccountClassEnum,
  debit: z.number(),
  credit: z.number(),
  balance: z.number(),
});
export type TrialBalanceReportItem = z.infer<typeof TrialBalanceReportItemSchema>;

export const TrialBalanceReportSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  asOfDate: z.string(),
  totalDebits: z.number(),
  totalCredits: z.number(),
  isBalanced: z.boolean(),
  items: z.array(TrialBalanceReportItemSchema),
});
export type TrialBalanceReport = z.infer<typeof TrialBalanceReportSchema>;

export const ExecutiveFinancialDashboardSchema = z.object({
  revenue: z.number(),
  cogs: z.number(),
  grossProfit: z.number(),
  grossMarginPct: z.number(),
  operatingExpenses: z.number(),
  netProfit: z.number(),
  netMarginPct: z.number(),
  cashPosition: z.number(),
  bankPosition: z.number(),
  accountsReceivable: z.number(),
  accountsPayable: z.number(),
  inventoryValue: z.number(),
  overdueReceivablesCount: z.number(),
  overduePayablesCount: z.number(),
  budgetVariancePct: z.number(),
  branchProfitability: z.array(
    z.object({
      branchId: z.string().uuid(),
      branchName: z.string(),
      revenue: z.number(),
      grossProfit: z.number(),
      netProfit: z.number(),
      marginPct: z.number(),
    })
  ),
});
export type ExecutiveFinancialDashboard = z.infer<typeof ExecutiveFinancialDashboardSchema>;

export const FinancialAnomalySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  anomalyType: z.string(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("WARNING"),
  description: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  detectedAt: z.string().or(z.date()),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().or(z.date()).nullable().optional(),
  resolvedById: z.string().uuid().nullable().optional(),
  metadata: z.any().optional(),
  createdAt: z.string().or(z.date()),
});
export type FinancialAnomaly = z.infer<typeof FinancialAnomalySchema>;