import { z } from "zod";

export const SaccoVicobaModuleManifestSchema = z.object({
  moduleId: z.literal("sacco_vicoba_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  orgType: z.enum(["FORMAL_SACCO", "COMMUNITY_VICOBA", "HYBRID"]),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type SaccoVicobaModuleManifest = z.infer<typeof SaccoVicobaModuleManifestSchema>;

export const SaccoVicobaSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  requireKycBeforeLoan: z.boolean().default(true),
  minShareCapitalTzs: z.number().default(50000),
  defaultMaxLoanMultiplierOfSavings: z.number().default(3.0),
  penaltyInterestRatePct: z.number().default(5.0),
});
export type SaccoVicobaSettings = z.infer<typeof SaccoVicobaSettingsSchema>;

export const MemberStatusEnum = z.enum(["APPLICATION", "KYC_PENDING", "ACTIVE", "DORMANT", "SUSPENDED", "EXITED"]);
export type MemberStatus = z.infer<typeof MemberStatusEnum>;

export const SaccoMemberSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  memberNumber: z.string(),
  fullName: z.string(),
  phone: z.string(),
  idType: z.enum(["NIDA", "VOTER_ID", "PASSPORT", "DRIVERS_LICENSE"]),
  idNumber: z.string(),
  groupId: z.string().optional(),
  groupName: z.string().optional(),
  shareBalanceTzs: z.number().default(0),
  savingsBalanceTzs: z.number().default(0),
  status: MemberStatusEnum,
  registeredAt: z.string().or(z.date()),
});
export type SaccoMember = z.infer<typeof SaccoMemberSchema>;

export const SaccoLoanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  loanNumber: z.string(),
  memberId: z.string().uuid(),
  memberName: z.string(),
  productName: z.string(),
  principalTzs: z.number(),
  interestRatePct: z.number(),
  termMonths: z.number(),
  totalInterestTzs: z.number(),
  totalRepayableTzs: z.number(),
  totalPaidTzs: z.number().default(0),
  outstandingPrincipalTzs: z.number(),
  status: z.enum(["SUBMITTED", "APPROVED", "DISBURSED", "IN_REPAYMENT", "ARREARS", "DEFAULT", "CLOSED", "WRITTEN_OFF"]),
  disbursedAt: z.string().or(z.date()).optional(),
  dueDate: z.string().or(z.date()),
});
export type SaccoLoan = z.infer<typeof SaccoLoanSchema>;

export const LoanRepaymentRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  loanId: z.string().uuid(),
  memberId: z.string().uuid(),
  amountPaidTzs: z.number(),
  penaltyAllocationTzs: z.number(),
  interestAllocationTzs: z.number(),
  principalAllocationTzs: z.number(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "SAVINGS_TRANSFER"]),
  transactionRef: z.string(),
  timestamp: z.string().or(z.date()),
});
export type LoanRepaymentRecord = z.infer<typeof LoanRepaymentRecordSchema>;

export const VicobaMeetingCycleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  groupId: z.string(),
  meetingDate: z.string().or(z.date()),
  membersPresentCount: z.number(),
  totalWeeklyContributionsTzs: z.number(),
  totalSocialFundTzs: z.number(),
  totalFinesTzs: z.number(),
  totalLoansIssuedTzs: z.number(),
  totalRepaymentsCollectedTzs: z.number(),
  cashInHandTzs: z.number(),
  status: z.enum(["IN_PROGRESS", "RECONCILED", "CLOSED"]),
});
export type VicobaMeetingCycle = z.infer<typeof VicobaMeetingCycleSchema>;

export const SaccoVicobaAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "ARREARS_RISK_WARNING",
    "LOAN_ELIGIBILITY_ALERT",
    "VICOBA_MEETING_DISCREPANCY",
    "SURPLUS_DIVIDEND_PROJECTION",
    "FRAUD_ANOMALY_FLAG",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type SaccoVicobaAiRecommendation = z.infer<typeof SaccoVicobaAiRecommendationSchema>;

export const SaccoVicobaEvidencePackageSchema = z.object({
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
export type SaccoVicobaEvidencePackage = z.infer<typeof SaccoVicobaEvidencePackageSchema>;
