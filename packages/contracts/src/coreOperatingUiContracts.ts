import { z } from "zod";

// 1. Core Operating Journey Schema
export const CoreOperatingJourneySchema = z.object({
  journeyId: z.string(),
  stepName: z.string(),
  activeWorkspace: z.enum([
    "DASHBOARD",
    "POS",
    "PRODUCTS",
    "INVENTORY",
    "CUSTOMERS",
    "SUPPLIERS",
    "SALES",
    "PURCHASES",
    "EXPENSES",
    "FINANCE",
    "REPORTS",
    "USERS",
    "SETTINGS",
  ]),
  isCompleted: z.boolean().default(false),
  timestamp: z.string(),
});

export type CoreOperatingJourney = z.infer<typeof CoreOperatingJourneySchema>;

// 2. Role Dashboard Perspective Schema
export const RoleDashboardPerspectiveSchema = z.object({
  role: z.enum(["EXECUTIVE", "MANAGER", "CASHIER", "STOREKEEPER", "FINANCE", "ADMIN"]),
  salesToday: z.number().nonnegative(),
  grossMarginPct: z.number(),
  lowStockItemsCount: z.number().int().nonnegative(),
  receivablesTotal: z.number().nonnegative(),
  payablesTotal: z.number().nonnegative(),
  cashPosition: z.number(),
  syncHealthPct: z.number().min(0).max(100),
});

export type RoleDashboardPerspective = z.infer<typeof RoleDashboardPerspectiveSchema>;

// 3. POS Cart Transaction Schema
export const PosCartTransactionSchema = z.object({
  transactionId: z.string(),
  customerId: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      unitPrice: z.number().positive(),
      quantity: z.number().positive(),
      lineSubtotal: z.number().positive(),
    })
  ),
  subtotal: z.number().nonnegative(),
  taxTotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  grandTotal: z.number().nonnegative(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE_MONEY", "SPLIT", "CREDIT"]),
  syncStatus: z.enum(["LOCAL_SAVED", "QUEUED_SYNC", "SYNCHRONIZING", "SYNCHRONIZED", "CONFLICT"]),
  createdOffline: z.boolean().optional(),
});


export type PosCartTransaction = z.infer<typeof PosCartTransactionSchema>;

// 4. Inventory Ledger Record Schema
export const InventoryLedgerRecordSchema = z.object({
  recordId: z.string(),
  productId: z.string(),
  movementType: z.enum(["SALE_DEDUCTION", "PURCHASE_RECEIPT", "ADJUSTMENT", "TRANSFER_IN", "TRANSFER_OUT", "RETURN"]),
  quantity: z.number(),
  prevBalance: z.number(),
  resultingBalance: z.number(),
  reason: z.string().optional(),
  userId: z.string(),
  branchId: z.string(),
  timestamp: z.string(),
});

export type InventoryLedgerRecord = z.infer<typeof InventoryLedgerRecordSchema>;

// 5. Customer 360 Summary Schema
export const Customer360SummarySchema = z.object({
  customerId: z.string(),
  name: z.string(),
  tin: z.string().optional(),
  creditLimit: z.number().nonnegative(),
  totalSalesVolume: z.number().nonnegative(),
  outstandingBalance: z.number(),
  loyaltyPoints: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
});

export type Customer360Summary = z.infer<typeof Customer360SummarySchema>;

// 6. Financial Traceability Record Schema
export const FinancialTraceabilityRecordSchema = z.object({
  saleId: z.string(),
  paymentId: z.string(),
  journalId: z.string(),
  ledgerId: z.string(),
  amount: z.number().positive(),
  status: z.enum(["POSTED", "RECONCILED", "PENDING_AUDIT"]),
});

export type FinancialTraceabilityRecord = z.infer<typeof FinancialTraceabilityRecordSchema>;

// 7. Approval Center Item Schema
export const ApprovalCenterItemSchema = z.object({
  approvalId: z.string(),
  category: z.enum(["DISCOUNT", "PURCHASE", "EXPENSE", "STOCK_ADJUSTMENT", "AI_ACTION"]),
  requestedBy: z.string(),
  amountOrImpact: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXECUTED", "VERIFIED"]),
  decisionReason: z.string().optional(),
});

export type ApprovalCenterItem = z.infer<typeof ApprovalCenterItemSchema>;

// 8. Core Operating UI Health Summary Schema
export const CoreOperatingUiHealthSummarySchema = z.object({
  totalOperatingWorkspaces: z.number().int().nonnegative(),
  journeysCompletedCount: z.number().int().nonnegative(),
  posCheckoutLatencyMs: z.number().nonnegative(),
  accessibilityScorePct: z.number().min(0).max(100),
  syncHealthPct: z.number().min(0).max(100),
  oneOperatingSystemInvariantPassing: z.boolean(),
});

export type CoreOperatingUiHealthSummary = z.infer<typeof CoreOperatingUiHealthSummarySchema>;
