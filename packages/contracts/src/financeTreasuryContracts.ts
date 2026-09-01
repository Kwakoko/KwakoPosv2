import { z } from "zod";

// ============================================================
// Phase 35 — Finance & Treasury Contracts (KFTL v1.0.0)
// ============================================================

// ─── 1. Enumerations ─────────────────────────────────────────

export const TreasuryCurrencyEnum = z.enum([
  "TZS", "KES", "UGX", "USD", "EUR", "GBP", "ZAR", "NGN", "GHS", "RWF",
]);
export type TreasuryCurrency = z.infer<typeof TreasuryCurrencyEnum>;

export const BankAccountTypeEnum = z.enum([
  "OPERATING", "PAYROLL", "COLLECTIONS", "RESERVE", "TAX", "ESCROW",
  "PETTY_CASH", "MOBILE_MONEY", "PAYMENT_PROVIDER", "INTERCOMPANY",
]);
export type BankAccountType = z.infer<typeof BankAccountTypeEnum>;

export const BankAccountStatusEnum = z.enum([
  "ACTIVE", "INACTIVE", "FROZEN", "CLOSED", "PENDING_VERIFICATION",
]);
export type BankAccountStatus = z.infer<typeof BankAccountStatusEnum>;

export const ReconciliationStatusEnum = z.enum([
  "UNMATCHED", "SUGGESTED_MATCH", "MATCHED", "PARTIALLY_MATCHED",
  "EXCEPTION", "RECONCILED", "REVERSAL_REQUIRED",
]);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusEnum>;

export const LiquidityStatusEnum = z.enum(["HEALTHY", "WATCH", "SHORTFALL_RISK", "CRITICAL"]);
export type LiquidityStatus = z.infer<typeof LiquidityStatusEnum>;

export const PaymentRunStatusEnum = z.enum([
  "DRAFT", "VALIDATING", "LIQUIDITY_CHECKED", "AWAITING_APPROVAL",
  "APPROVED", "EXECUTING", "CONFIRMING", "POSTING", "RECONCILING",
  "COMPLETE", "FAILED", "CANCELLED",
]);
export type PaymentRunStatus = z.infer<typeof PaymentRunStatusEnum>;

export const PaymentRunItemStatusEnum = z.enum([
  "PENDING", "APPROVED", "SENT", "CONFIRMED", "FAILED", "REVERSED", "DUPLICATE_BLOCKED",
]);
export type PaymentRunItemStatus = z.infer<typeof PaymentRunItemStatusEnum>;

export const BeneficiaryStatusEnum = z.enum([
  "PENDING_VERIFICATION", "VERIFIED", "SUSPENDED", "COOLDOWN", "REJECTED",
]);
export type BeneficiaryStatus = z.infer<typeof BeneficiaryStatusEnum>;

export const TreasuryExceptionTypeEnum = z.enum([
  "UNMATCHED_PAYMENT", "MISSING_SETTLEMENT", "BALANCE_MISMATCH",
  "DUPLICATE_PAYMENT", "BENEFICIARY_ISSUE", "FAILED_TRANSFER",
  "BANK_INTEGRATION_FAILURE", "CASH_VARIANCE", "UNAUTHORIZED_PAYMENT",
  "SETTLEMENT_DELAY", "FX_ANOMALY",
]);
export type TreasuryExceptionType = z.infer<typeof TreasuryExceptionTypeEnum>;

export const TreasuryExceptionStatusEnum = z.enum([
  "CREATED", "ASSIGNED", "INVESTIGATING", "RESOLVED", "VERIFIED", "CLOSED",
]);
export type TreasuryExceptionStatus = z.infer<typeof TreasuryExceptionStatusEnum>;

export const TreasuryRiskLevelEnum = z.enum(["NORMAL", "WARNING", "ELEVATED", "CRITICAL"]);
export type TreasuryRiskLevel = z.infer<typeof TreasuryRiskLevelEnum>;

export const ForecastScenarioEnum = z.enum(["BASE", "CONSERVATIVE", "STRESS", "SHOCK", "EXPANSION"]);
export type ForecastScenario = z.infer<typeof ForecastScenarioEnum>;

export const SettlementStatusEnum = z.enum(["EXPECTED", "RECEIVED", "SETTLED", "RECONCILED", "DELAYED", "FAILED"]);
export type SettlementStatus = z.infer<typeof SettlementStatusEnum>;

// ─── 2. Bank Account Registry ────────────────────────────────

export const TreasuryBankAccountSchema = z.object({
  accountId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  bank: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  accountType: BankAccountTypeEnum,
  currency: TreasuryCurrencyEnum,
  status: BankAccountStatusEnum,
  purpose: z.string(),
  authorizedUserIds: z.array(z.string()).optional(),
  integrationEnabled: z.boolean().optional(),
  lastStatementDate: z.string().optional(),
  lastReconciliationDate: z.string().optional(),
  currentBalance: z.number().optional(),
  availableBalance: z.number().optional(),
  isDefault: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TreasuryBankAccount = z.infer<typeof TreasuryBankAccountSchema>;

// ─── 3. Bank Statement & Transactions ────────────────────────

export const BankStatementLineSchema = z.object({
  lineId: z.string(),
  statementId: z.string(),
  accountId: z.string(),
  transactionDate: z.string(),
  valueDate: z.string(),
  description: z.string(),
  reference: z.string().optional(),
  debitAmount: z.number().default(0),
  creditAmount: z.number().default(0),
  runningBalance: z.number(),
  currency: TreasuryCurrencyEnum,
  reconciliationStatus: ReconciliationStatusEnum,
  matchedLedgerRef: z.string().optional(),
  matchConfidence: z.number().min(0).max(1).optional(),
  exceptionRef: z.string().optional(),
  importedAt: z.string(),
});
export type BankStatementLine = z.infer<typeof BankStatementLineSchema>;

export const BankStatementSchema = z.object({
  statementId: z.string(),
  accountId: z.string(),
  tenantId: z.string(),
  bankName: z.string(),
  statementPeriodFrom: z.string(),
  statementPeriodTo: z.string(),
  openingBalance: z.number(),
  closingBalance: z.number(),
  totalCredits: z.number(),
  totalDebits: z.number(),
  currency: TreasuryCurrencyEnum,
  source: z.enum(["API", "CSV_UPLOAD", "MANUAL", "FILE_IMPORT"]),
  lines: z.array(BankStatementLineSchema).default([]),
  importedAt: z.string(),
  importedBy: z.string(),
});
export type BankStatement = z.infer<typeof BankStatementSchema>;

// ─── 4. Reconciliation ────────────────────────────────────────

export const ReconciliationMatchSchema = z.object({
  matchId: z.string(),
  statementLineId: z.string(),
  ledgerRef: z.string(),
  matchType: z.enum(["EXACT", "AMOUNT_ONLY", "REFERENCE_ONLY", "FUZZY", "MANUAL"]),
  matchConfidence: z.number().min(0).max(1),
  amountDifference: z.number().default(0),
  dateDifference: z.number().int().default(0),
  status: ReconciliationStatusEnum,
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  reconciledAt: z.string().optional(),
  notes: z.string().optional(),
});
export type ReconciliationMatch = z.infer<typeof ReconciliationMatchSchema>;

export const ReconciliationRunSchema = z.object({
  runId: z.string(),
  accountId: z.string(),
  tenantId: z.string(),
  statementId: z.string(),
  periodFrom: z.string(),
  periodTo: z.string(),
  totalStatementLines: z.number().int().nonnegative(),
  matchedLines: z.number().int().nonnegative(),
  unmatchedLines: z.number().int().nonnegative(),
  exceptionLines: z.number().int().nonnegative(),
  reconciledLines: z.number().int().nonnegative(),
  openingBalanceMatch: z.boolean(),
  closingBalanceMatch: z.boolean(),
  matches: z.array(ReconciliationMatchSchema).default([]),
  status: z.enum(["IN_PROGRESS", "REVIEW_REQUIRED", "COMPLETE", "FAILED"]),
  initiatedBy: z.string(),
  completedAt: z.string().optional(),
  auditRef: z.string().optional(),
  createdAt: z.string(),
});
export type ReconciliationRun = z.infer<typeof ReconciliationRunSchema>;

// ─── 5. Cash Position ─────────────────────────────────────────

export const CashPositionSchema = z.object({
  positionId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  calculatedAt: z.string(),
  currency: TreasuryCurrencyEnum,
  cashOnHand: z.number().default(0),
  bankBalances: z.number().default(0),
  mobileMoneyBalances: z.number().default(0),
  paymentProviderBalances: z.number().default(0),
  pendingReceipts: z.number().default(0),
  pendingDisbursements: z.number().default(0),
  outstandingObligations: z.number().default(0),
  restrictedCash: z.number().default(0),
  availableLiquidity: z.number(),
  projectedClosingCash: z.number(),
  liquidityStatus: LiquidityStatusEnum,
  minimumLiquidityBuffer: z.number().default(0),
  surplusOrShortfall: z.number(),
});
export type CashPosition = z.infer<typeof CashPositionSchema>;

// ─── 6. Liquidity Forecast ────────────────────────────────────

export const ForecastLineSchema = z.object({
  forecastDate: z.string(),
  expectedInflows: z.number().default(0),
  expectedOutflows: z.number().default(0),
  netCashFlow: z.number(),
  projectedBalance: z.number(),
  confidenceScore: z.number().min(0).max(1).default(0.8),
});
export type ForecastLine = z.infer<typeof ForecastLineSchema>;

export const LiquidityForecastSchema = z.object({
  forecastId: z.string(),
  tenantId: z.string(),
  scenario: ForecastScenarioEnum,
  generatedAt: z.string(),
  horizonDays: z.number().int().positive(),
  currency: TreasuryCurrencyEnum,
  openingBalance: z.number(),
  lines: z.array(ForecastLineSchema).default([]),
  shortfallDate: z.string().optional(),
  surplusAmount: z.number().optional(),
  liquidityStatus: LiquidityStatusEnum,
  aiAssisted: z.boolean().default(false),
});
export type LiquidityForecast = z.infer<typeof LiquidityForecastSchema>;

// ─── 7. Payment Run ───────────────────────────────────────────

export const PaymentRunItemSchema = z.object({
  itemId: z.string(),
  runId: z.string(),
  beneficiaryId: z.string(),
  payableRef: z.string(),
  amount: z.number().positive(),
  currency: TreasuryCurrencyEnum,
  dueDate: z.string(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  status: PaymentRunItemStatusEnum,
  paymentRef: z.string().optional(),
  providerConfirmation: z.string().optional(),
  ledgerRef: z.string().optional(),
  reconciledAt: z.string().optional(),
  failureReason: z.string().optional(),
});
export type PaymentRunItem = z.infer<typeof PaymentRunItemSchema>;

export const PaymentRunSchema = z.object({
  runId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  status: PaymentRunStatusEnum,
  currency: TreasuryCurrencyEnum,
  totalAmount: z.number().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  items: z.array(PaymentRunItemSchema).default([]),
  liquidityCheckPassed: z.boolean().default(false),
  approvalRef: z.string().optional(),
  executionRef: z.string().optional(),
  initiatedBy: z.string(),
  approvedBy: z.string().optional(),
  executedAt: z.string().optional(),
  reconciledAt: z.string().optional(),
  idempotencyKey: z.string(),
  auditRef: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PaymentRun = z.infer<typeof PaymentRunSchema>;

// ─── 8. Beneficiary Registry ──────────────────────────────────

export const BeneficiarySchema = z.object({
  beneficiaryId: z.string(),
  tenantId: z.string(),
  name: z.string(),
  type: z.enum(["SUPPLIER", "EMPLOYEE", "CUSTOMER", "PARTNER", "INTERCOMPANY", "TAX_AUTHORITY", "OTHER"]),
  bank: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  currency: TreasuryCurrencyEnum,
  verificationStatus: BeneficiaryStatusEnum,
  approvedLimit: z.number().nonnegative().optional(),
  cooldownUntil: z.string().optional(),
  lastChangeAt: z.string().optional(),
  lastChangedBy: z.string().optional(),
  changeHistory: z.array(z.object({
    changedAt: z.string(),
    changedBy: z.string(),
    field: z.string(),
    oldValue: z.string(),
    newValue: z.string(),
    approvalRef: z.string().optional(),
  })).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Beneficiary = z.infer<typeof BeneficiarySchema>;

// ─── 9. Treasury Policy ───────────────────────────────────────

export const TreasuryPolicySchema = z.object({
  policyId: z.string(),
  policyVersion: z.string(),
  policyName: z.string(),
  domain: z.enum([
    "PAYMENT", "TRANSFER", "BANK_ACCOUNT", "BENEFICIARY",
    "CASH", "PETTY_CASH", "LIQUIDITY", "FX", "SETTLEMENT",
  ]),
  maxPaymentAmount: z.number().nonnegative().optional(),
  dailyTransferLimit: z.number().nonnegative().optional(),
  approvalThreshold: z.number().nonnegative().optional(),
  minimumLiquidityBuffer: z.number().nonnegative().optional(),
  branchCashLimit: z.number().nonnegative().optional(),
  bankConcentrationWarningPct: z.number().min(0).max(100).optional(),
  beneficiaryCooldownHours: z.number().int().nonnegative().optional(),
  paymentCutoffTime: z.string().optional(),
  currency: TreasuryCurrencyEnum.optional(),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
});
export type TreasuryPolicy = z.infer<typeof TreasuryPolicySchema>;

// ─── 10. Settlement ───────────────────────────────────────────

export const SettlementRecordSchema = z.object({
  settlementId: z.string(),
  tenantId: z.string(),
  provider: z.string(),
  expectedAmount: z.number().nonnegative(),
  receivedAmount: z.number().nonnegative().optional(),
  currency: TreasuryCurrencyEnum,
  expectedDate: z.string(),
  receivedDate: z.string().optional(),
  status: SettlementStatusEnum,
  delayDays: z.number().int().nonnegative().optional(),
  feeDeducted: z.number().nonnegative().default(0),
  netSettlement: z.number().optional(),
  reconciliationRef: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SettlementRecord = z.infer<typeof SettlementRecordSchema>;

// ─── 11. Treasury Exception ───────────────────────────────────

export const TreasuryExceptionSchema = z.object({
  exceptionId: z.string(),
  tenantId: z.string(),
  type: TreasuryExceptionTypeEnum,
  status: TreasuryExceptionStatusEnum,
  severity: TreasuryRiskLevelEnum,
  title: z.string(),
  description: z.string(),
  relatedRef: z.string().optional(),
  assignedTo: z.string().optional(),
  investigationNotes: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
  verifiedBy: z.string().optional(),
  verifiedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TreasuryException = z.infer<typeof TreasuryExceptionSchema>;

// ─── 12. Working Capital Metrics ─────────────────────────────

export const WorkingCapitalMetricsSchema = z.object({
  tenantId: z.string(),
  calculatedAt: z.string(),
  currency: TreasuryCurrencyEnum,
  totalReceivables: z.number().default(0),
  totalPayables: z.number().default(0),
  inventoryValue: z.number().default(0),
  operatingCash: z.number().default(0),
  dso: z.number().nonnegative().default(0),  // Days Sales Outstanding
  dpo: z.number().nonnegative().default(0),  // Days Payable Outstanding
  inventoryDays: z.number().nonnegative().default(0),
  cashConversionCycle: z.number().default(0),
  workingCapital: z.number(),
});
export type WorkingCapitalMetrics = z.infer<typeof WorkingCapitalMetricsSchema>;

// ─── 13. Treasury Audit Entry ────────────────────────────────

export const TreasuryAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "BANK_ACCOUNT_REGISTERED", "STATEMENT_IMPORTED", "RECONCILIATION_STARTED",
    "RECONCILIATION_COMPLETED", "EXCEPTION_CREATED", "EXCEPTION_RESOLVED",
    "PAYMENT_RUN_CREATED", "PAYMENT_RUN_APPROVED", "PAYMENT_RUN_EXECUTED",
    "PAYMENT_RUN_FAILED", "PAYMENT_RUN_CANCELLED", "BENEFICIARY_REGISTERED",
    "BENEFICIARY_CHANGED", "POLICY_APPLIED", "LIQUIDITY_ALERT",
    "SETTLEMENT_RECEIVED", "SETTLEMENT_DELAYED", "GUARDRAIL_TRIGGERED",
    "FRAUD_ALERT", "PERIOD_CLOSED", "INTERCOMPANY_TRANSFER",
  ]),
  actorId: z.string(),
  relatedRef: z.string().optional(),
  amount: z.number().optional(),
  currency: TreasuryCurrencyEnum.optional(),
  details: z.string(),
  timestamp: z.string(),
});
export type TreasuryAuditEntry = z.infer<typeof TreasuryAuditEntrySchema>;

// ─── 14. Treasury Health Summary ─────────────────────────────

export const TreasuryHealthSummarySchema = z.object({
  tenantId: z.string(),
  calculatedAt: z.string(),
  totalBankAccounts: z.number().int().nonnegative(),
  totalBeneficiaries: z.number().int().nonnegative(),
  totalPolicies: z.number().int().nonnegative(),
  pendingPaymentRuns: z.number().int().nonnegative(),
  activeExceptions: z.number().int().nonnegative(),
  unreconciledStatements: z.number().int().nonnegative(),
  pendingSettlements: z.number().int().nonnegative(),
  liquidityStatus: LiquidityStatusEnum,
  riskLevel: TreasuryRiskLevelEnum,
  treasuryEngineOperational: z.boolean(),
});
export type TreasuryHealthSummary = z.infer<typeof TreasuryHealthSummarySchema>;
