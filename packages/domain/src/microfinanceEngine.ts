import { randomUUID } from "crypto";
import type {
  TenantContext,
  MicrofinanceModuleManifest,
  MicrofinanceSettings,
  MicrofinanceBorrower,
  MicrofinanceLoan,
  MicrofinanceRepayment,
  MicrofinanceAiRecommendation,
} from "@kwakopos2/contracts";

export class MicrofinanceOperatingEngine {
  getModuleManifest(): MicrofinanceModuleManifest {
    return {
      moduleId: "microfinance_lending_operating_system",
      name: "KwakoPos Enterprise Microfinance & Lending Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedLendingModels: [
        "INDIVIDUAL_LENDING",
        "GROUP_LENDING",
        "SME_LENDING",
        "SALARY_BACKED",
        "ASSET_FINANCE",
        "INVOICE_DISCOUNTING",
      ],
      permissions: [
        "MICROFINANCE_BORROWER_VIEW",
        "MICROFINANCE_BORROWER_MANAGE",
        "MICROFINANCE_KYC_VERIFY",
        "MICROFINANCE_LOAN_APPLY",
        "MICROFINANCE_LOAN_ASSESS",
        "MICROFINANCE_LOAN_APPROVE",
        "MICROFINANCE_LOAN_DISBURSE",
        "MICROFINANCE_REPAYMENT_POST",
        "MICROFINANCE_ARREARS_MANAGE",
        "MICROFINANCE_AI_CREDIT_VIEW",
      ],
      navigationRoutes: [
        "/microfinance/borrowers",
        "/microfinance/kyc",
        "/microfinance/products",
        "/microfinance/applications",
        "/microfinance/loans",
        "/microfinance/repayments",
        "/microfinance/collections",
        "/microfinance/portfolio",
        "/microfinance/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_active_borrowers",
        "widget_gross_portfolio",
        "widget_disbursements_today",
        "widget_collections_today",
        "widget_par_30_indicator",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): MicrofinanceSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      requireKycBeforeDisbursement: true,
      defaultInterestMethod: "REDUCING_BALANCE",
      defaultPenaltyRatePct: 5.0,
      parAlertThresholdDays: 30,
    };
  }

  calculateAffordabilityAndCreditScore(
    incomeTzs: number,
    existingExpensesTzs: number,
    requestedInstallmentTzs: number
  ): {
    disposableIncomeTzs: number;
    debtServiceRatioPct: number;
    isAffordable: boolean;
    creditScore: number;
    riskCategory: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
  } {
    const disposableIncomeTzs = incomeTzs - existingExpensesTzs;
    const debtServiceRatioPct = incomeTzs > 0 ? (requestedInstallmentTzs / incomeTzs) * 100 : 100;
    const isAffordable = requestedInstallmentTzs <= disposableIncomeTzs * 0.5;

    let creditScore = 700;
    if (debtServiceRatioPct > 50) creditScore -= 120;
    else if (debtServiceRatioPct > 35) creditScore -= 50;

    if (disposableIncomeTzs < 200000) creditScore -= 80;

    let riskCategory: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" = "LOW_RISK";
    if (creditScore < 550) riskCategory = "HIGH_RISK";
    else if (creditScore < 650) riskCategory = "MEDIUM_RISK";

    return {
      disposableIncomeTzs: Math.max(0, disposableIncomeTzs),
      debtServiceRatioPct: parseFloat(debtServiceRatioPct.toFixed(2)),
      isAffordable,
      creditScore,
      riskCategory,
    };
  }

  allocateRepaymentWaterfall(
    amountPaidTzs: number,
    duePenaltyTzs: number,
    dueInterestTzs: number,
    duePrincipalTzs: number
  ): {
    allocatedPenaltyTzs: number;
    allocatedInterestTzs: number;
    allocatedPrincipalTzs: number;
    overpaymentTzs: number;
  } {
    let remaining = amountPaidTzs;

    const allocatedPenaltyTzs = Math.min(remaining, duePenaltyTzs);
    remaining -= allocatedPenaltyTzs;

    const allocatedInterestTzs = Math.min(remaining, dueInterestTzs);
    remaining -= allocatedInterestTzs;

    const allocatedPrincipalTzs = Math.min(remaining, duePrincipalTzs);
    remaining -= allocatedPrincipalTzs;

    return {
      allocatedPenaltyTzs,
      allocatedInterestTzs,
      allocatedPrincipalTzs,
      overpaymentTzs: remaining,
    };
  }

  classifyPortfolioArrears(
    daysPastDue: number
  ): "CURRENT" | "WATCH" | "PAR_30" | "PAR_60" | "PAR_90" | "DEFAULT" {
    if (daysPastDue <= 0) return "CURRENT";
    if (daysPastDue <= 30) return "WATCH";
    if (daysPastDue <= 60) return "PAR_30";
    if (daysPastDue <= 90) return "PAR_60";
    if (daysPastDue <= 180) return "PAR_90";
    return "DEFAULT";
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    borrowers: MicrofinanceBorrower[],
    loans: MicrofinanceLoan[],
    repayments: MicrofinanceRepayment[]
  ): MicrofinanceAiRecommendation[] {
    const recs: MicrofinanceAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Collections Priority
    const arrearsLoans = loans.filter((l) => l.status === "ARREARS" || l.status === "DEFAULT");
    if (arrearsLoans.length > 0) {
      const arrearsTotal = arrearsLoans.reduce((a, b) => a + b.outstandingPrincipalTzs, 0);
      recs.push({
        id: `REC-MFI-COLL-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "COLLECTIONS_PRIORITY",
        observation: `${arrearsLoans.length} active microfinance loans in ARREARS / DEFAULT status totaling ${arrearsTotal.toLocaleString()} TZS.`,
        evidence: `Borrower ${arrearsLoans[0].borrowerName} (Loan #${arrearsLoans[0].loanNumber}) has outstanding principal of ${arrearsLoans[0].outstandingPrincipalTzs.toLocaleString()} TZS.`,
        recommendation: "Assign field collection officer for immediate customer visit and promise-to-pay commitment.",
        expectedImpact: `Recovers ${arrearsTotal.toLocaleString()} TZS delinquent principal and reduces portfolio PAR-30.`,
        confidenceScore: 97,
        createdAt: now,
      });
    }

    return recs;
  }
}

export const globalMicrofinanceOperatingEngine = new MicrofinanceOperatingEngine();
export const globalMicrofinanceEngine = globalMicrofinanceOperatingEngine;
export { MicrofinanceOperatingEngine as MicrofinanceEngine };
