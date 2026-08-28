import { randomUUID } from "crypto";
import type {
  TenantContext,
  SaccoVicobaModuleManifest,
  SaccoVicobaSettings,
  SaccoMember,
  SaccoLoan,
  LoanRepaymentRecord,
  VicobaMeetingCycle,
  SaccoVicobaAiRecommendation,
} from "@kwakopos2/contracts";

export class SaccoVicobaOperatingEngine {
  getModuleManifest(): SaccoVicobaModuleManifest {
    return {
      moduleId: "sacco_vicoba_operating_system",
      name: "KwakoPos Enterprise SACCO & VICOBA Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      orgType: "HYBRID",
      permissions: [
        "SACCO_MEMBER_VIEW",
        "SACCO_MEMBER_MANAGE",
        "SACCO_SAVINGS_POST",
        "SACCO_LOAN_APPLY",
        "SACCO_LOAN_APPROVE",
        "SACCO_LOAN_DISBURSE",
        "SACCO_REPAYMENT_POST",
        "SACCO_VICOBA_MEETING_MANAGE",
        "SACCO_SURPLUS_DIVIDEND_MANAGE",
        "SACCO_AI_CREDIT_VIEW",
      ],
      navigationRoutes: [
        "/sacco/members",
        "/sacco/groups",
        "/sacco/savings",
        "/sacco/loans",
        "/sacco/repayments",
        "/sacco/vicoba-meetings",
        "/sacco/dividends",
        "/sacco/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_total_members",
        "widget_savings_portfolio",
        "widget_active_loans",
        "widget_arrears_par30",
        "widget_vicoba_cash_in_hand",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): SaccoVicobaSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      requireKycBeforeLoan: true,
      minShareCapitalTzs: 50000,
      defaultMaxLoanMultiplierOfSavings: 3.0,
      penaltyInterestRatePct: 5.0,
    };
  }

  evaluateLoanEligibility(
    member: SaccoMember,
    requestedAmountTzs: number,
    settings: SaccoVicobaSettings
  ): {
    eligible: boolean;
    maxAllowedAmountTzs: number;
    reasons: string[];
  } {
    const reasons: string[] = [];

    if (member.status !== "ACTIVE") {
      reasons.push(`Member status is '${member.status}', must be ACTIVE.`);
    }

    if (member.shareBalanceTzs < settings.minShareCapitalTzs) {
      reasons.push(`Minimum share capital of ${settings.minShareCapitalTzs.toLocaleString()} TZS required.`);
    }

    const maxAllowedAmountTzs = Math.round(member.savingsBalanceTzs * settings.defaultMaxLoanMultiplierOfSavings);

    if (requestedAmountTzs > maxAllowedAmountTzs) {
      reasons.push(
        `Requested ${requestedAmountTzs.toLocaleString()} TZS exceeds max allowed limit of ${maxAllowedAmountTzs.toLocaleString()} TZS (3.0× savings of ${member.savingsBalanceTzs.toLocaleString()} TZS).`
      );
    }

    return {
      eligible: reasons.length === 0,
      maxAllowedAmountTzs,
      reasons,
    };
  }

  allocateRepayment(
    amountPaidTzs: number,
    duePenaltyTzs: number,
    dueInterestTzs: number,
    duePrincipalTzs: number
  ): {
    penaltyAllocationTzs: number;
    interestAllocationTzs: number;
    principalAllocationTzs: number;
    overpaymentTzs: number;
  } {
    let remaining = amountPaidTzs;

    const penaltyAllocationTzs = Math.min(remaining, duePenaltyTzs);
    remaining -= penaltyAllocationTzs;

    const interestAllocationTzs = Math.min(remaining, dueInterestTzs);
    remaining -= interestAllocationTzs;

    const principalAllocationTzs = Math.min(remaining, duePrincipalTzs);
    remaining -= principalAllocationTzs;

    const overpaymentTzs = remaining;

    return {
      penaltyAllocationTzs,
      interestAllocationTzs,
      principalAllocationTzs,
      overpaymentTzs,
    };
  }

  reconcileVicobaMeeting(
    weeklyContributionsTzs: number,
    socialFundTzs: number,
    finesTzs: number,
    repaymentsCollectedTzs: number,
    loansIssuedTzs: number
  ): {
    totalInflowsTzs: number;
    totalOutflowsTzs: number;
    netCashInHandTzs: number;
  } {
    const totalInflowsTzs = weeklyContributionsTzs + socialFundTzs + finesTzs + repaymentsCollectedTzs;
    const totalOutflowsTzs = loansIssuedTzs;
    const netCashInHandTzs = totalInflowsTzs - totalOutflowsTzs;

    if (netCashInHandTzs < 0) {
      throw new Error(`VICOBA Reconciliation Deficit! Loans issued (${loansIssuedTzs} TZS) exceed total meeting cash inflows (${totalInflowsTzs} TZS).`);
    }

    return {
      totalInflowsTzs,
      totalOutflowsTzs,
      netCashInHandTzs,
    };
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    members: SaccoMember[],
    loans: SaccoLoan[],
    meetings: VicobaMeetingCycle[]
  ): SaccoVicobaAiRecommendation[] {
    const recs: SaccoVicobaAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Arrears PAR-30 Risk
    const arrearsLoans = loans.filter((l) => l.status === "ARREARS" || l.status === "DEFAULT");
    if (arrearsLoans.length > 0) {
      const arrearsTotal = arrearsLoans.reduce((a, b) => a + b.outstandingPrincipalTzs, 0);
      recs.push({
        id: `REC-SACCO-ARREARS-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "ARREARS_RISK_WARNING",
        observation: `${arrearsLoans.length} loans in ARREARS / DEFAULT status totaling ${arrearsTotal.toLocaleString()} TZS.`,
        evidence: `Loan #${arrearsLoans[0].loanNumber} outstanding principal: ${arrearsLoans[0].outstandingPrincipalTzs.toLocaleString()} TZS.`,
        recommendation: "Initiate guarantor notification and mobile reminder workflow.",
        expectedImpact: `Protects loan portfolio asset quality and recovers ${arrearsTotal.toLocaleString()} TZS.`,
        confidenceScore: 96,
        createdAt: now,
      });
    }

    return recs;
  }
}

export const globalSaccoVicobaOperatingEngine = new SaccoVicobaOperatingEngine();
export const globalSaccoVicobaEngine = globalSaccoVicobaOperatingEngine;
export { SaccoVicobaOperatingEngine as SaccoVicobaEngine };
