import { z } from "zod";

export const MicrofinanceModuleManifestSchema = z.object({
  moduleId: z.literal("microfinance_lending_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedLendingModels: z.array(
    z.enum(["INDIVIDUAL_LENDING", "GROUP_LENDING", "SME_LENDING", "SALARY_BACKED", "ASSET_FINANCE", "INVOICE_DISCOUNTING"])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type MicrofinanceModuleManifest = z.infer<typeof MicrofinanceModuleManifestSchema>;

export const MicrofinanceSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  requireKycBeforeDisbursement: z.boolean().default(true),
  defaultInterestMethod: z.enum(["REDUCING_BALANCE", "FLAT_RATE"]).default("REDUCING_BALANCE"),
  defaultPenaltyRatePct: z.number().default(5.0),
  parAlertThresholdDays: z.number().default(30),
});
export type MicrofinanceSettings = z.infer<typeof MicrofinanceSettingsSchema>;

export const BorrowerStatusEnum = z.enum(["PROSPECT", "KYC_VERIFIED", "ACTIVE_BORROWER", "DELINQUENT", "BLACKLISTED"]);
export type BorrowerStatus = z.infer<typeof BorrowerStatusEnum>;

export const MicrofinanceBorrowerSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  borrowerCode: z.string(),
  fullName: z.string(),
  phone: z.string(),
  nationalIdNumber: z.string(),
  borrowerType: z.enum(["INDIVIDUAL", "SME_BUSINESS", "GROUP_MEMBER"]),
  creditScore: z.number().default(650),
  status: BorrowerStatusEnum,
  createdAt: z.string().or(z.date()),
});
export type MicrofinanceBorrower = z.infer<typeof MicrofinanceBorrowerSchema>;

export const MicrofinanceLoanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  loanNumber: z.string(),
  borrowerId: z.string().uuid(),
  borrowerName: z.string(),
  productName: z.string(),
  principalTzs: z.number(),
  interestRatePct: z.number(),
  termMonths: z.number(),
  totalInterestTzs: z.number(),
  totalRepayableTzs: z.number(),
  totalPaidTzs: z.number().default(0),
  outstandingPrincipalTzs: z.number(),
  status: z.enum(["DRAFT", "APPLIED", "UNDER_REVIEW", "APPROVED", "DISBURSED", "ARREARS", "DEFAULT", "RESTRUCTURED", "CLOSED", "WRITTEN_OFF"]),
  disbursedAt: z.string().or(z.date()).optional(),
  dueDate: z.string().or(z.date()),
});
export type MicrofinanceLoan = z.infer<typeof MicrofinanceLoanSchema>;

export const MicrofinanceRepaymentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  loanId: z.string().uuid(),
  borrowerId: z.string().uuid(),
  amountPaidTzs: z.number(),
  allocatedPenaltyTzs: z.number(),
  allocatedInterestTzs: z.number(),
  allocatedPrincipalTzs: z.number(),
  paymentChannel: z.enum(["CASH", "BANK", "MOBILE_MONEY", "WALLET"]),
  transactionRef: z.string(),
  timestamp: z.string().or(z.date()),
});
export type MicrofinanceRepayment = z.infer<typeof MicrofinanceRepaymentSchema>;

export const MicrofinanceAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "CREDIT_RISK_SCORE",
    "COLLECTIONS_PRIORITY",
    "FRAUD_ANOMALY_DETECTION",
    "EARLY_WARNING_RISK",
    "REFINANCING_OPPORTUNITY",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type MicrofinanceAiRecommendation = z.infer<typeof MicrofinanceAiRecommendationSchema>;

export const MicrofinanceEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  evaluations: z.array(
    z.object({
      pillarId: z.number(),
      pillarName: z.string(),
      passed: z.boolean(),
      details: z.string(),
    })
  ),
  digest: z.string(),
});
export type MicrofinanceEvidencePackage = z.infer<typeof MicrofinanceEvidencePackageSchema>;
