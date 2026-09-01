import {
  PmfVerticalState,
  InvestmentActionRule,
  PmfHealthScoreInput,
  PmfHealthScoreOutput,
  CustomerFeedbackRecord,
  FeedbackCategory,
} from "@kwakopos2/contracts";

export interface FalsePmfAnomalyAlert {
  verticalId: string;
  anomalyType:
    | "HIGH_SIGNUP_LOW_ACTIVATION"
    | "HIGH_USAGE_LOW_REVENUE"
    | "HIGH_RETENTION_HIGH_SUPPORT_COST"
    | "HIGH_REVENUE_POOR_RELIABILITY";
  severity: "HIGH" | "MEDIUM" | "CRITICAL";
  description: string;
  recommendation: string;
}

export class PmfValidationEngine {
  /**
   * Calculates Product-Market Fit (PMF) Health Score based on user-approved weighted model:
   * Retention (20%), Revenue (20%), Activation (15%), WAU (15%), Adoption (15%), Reliability (15%)
   * Penalties: Support Burden (-15% max), Churn (-15% max).
   */
  public calculatePmfHealthScore(input: PmfHealthScoreInput): PmfHealthScoreOutput {
    const retentionComponent = Math.min(20, (input.cohortRetentionPct / 100) * 20);
    const revenueComponent = Math.min(20, (input.recurringRevenueUsd / 10000) * 20);
    const activationComponent = Math.min(15, (input.activationRatePct / 100) * 15);
    const wauComponent = Math.min(15, (input.weeklyActiveUsersCount / 100) * 15);
    const adoptionComponent = Math.min(15, (input.workflowAdoptionRatePct / 100) * 15);
    const reliabilityComponent = Math.min(15, (input.operationalReliabilityPct / 100) * 15);

    const supportPenalty = Math.min(15, input.supportTicketsPerCustomer * 3);
    const churnPenalty = Math.min(15, input.monthlyChurnRatePct * 3);

    const positiveTotal = retentionComponent + revenueComponent + activationComponent + wauComponent + adoptionComponent + reliabilityComponent;
    const rawScore = positiveTotal - supportPenalty - churnPenalty;
    const normalizedHealthScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    let pmfState: PmfVerticalState = "VALIDATION_REQUIRED";
    let investmentAction: InvestmentActionRule = "PILOT_MORE";

    if (normalizedHealthScore >= 80) {
      pmfState = "PROVEN";
      investmentAction = "DOUBLE_DOWN";
    } else if (normalizedHealthScore >= 65) {
      pmfState = "PROMISING";
      investmentAction = "OPTIMIZE";
    } else if (normalizedHealthScore >= 50) {
      pmfState = "VALIDATION_REQUIRED";
      investmentAction = "PILOT_MORE";
    } else if (normalizedHealthScore >= 35) {
      pmfState = "PRODUCT_GAP";
      investmentAction = "OPTIMIZE";
    } else if (normalizedHealthScore >= 20) {
      pmfState = "COMMERCIAL_RISK";
      investmentAction = "PAUSE";
    } else {
      pmfState = "PAUSED";
      investmentAction = "RETIRE";
    }

    return {
      verticalId: input.verticalId,
      normalizedHealthScore,
      pmfState,
      investmentAction,
      scoreBreakdown: {
        retentionComponent: Math.round(retentionComponent * 10) / 10,
        revenueComponent: Math.round(revenueComponent * 10) / 10,
        activationComponent: Math.round(activationComponent * 10) / 10,
        wauComponent: Math.round(wauComponent * 10) / 10,
        adoptionComponent: Math.round(adoptionComponent * 10) / 10,
        reliabilityComponent: Math.round(reliabilityComponent * 10) / 10,
        supportPenalty: Math.round(supportPenalty * 10) / 10,
        churnPenalty: Math.round(churnPenalty * 10) / 10,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates telemetry and flags False PMF Anomalies to prevent misleading strategic investment.
   */
  public detectFalsePmfAnomalies(input: PmfHealthScoreInput): FalsePmfAnomalyAlert[] {
    const alerts: FalsePmfAnomalyAlert[] = [];

    // 1. High Signups / Activity + Low Activation
    if (input.weeklyActiveUsersCount > 30 && input.activationRatePct < 30) {
      alerts.push({
        verticalId: input.verticalId,
        anomalyType: "HIGH_SIGNUP_LOW_ACTIVATION",
        severity: "HIGH",
        description: `Vertical '${input.verticalId}' shows high user count (${input.weeklyActiveUsersCount}) but low activation rate (${input.activationRatePct}%).`,
        recommendation: "Investigate onboarding friction, excessive configuration steps, or unclear terminology.",
      });
    }

    // 2. High Usage + Low Revenue (Monetization Problem)
    if (input.weeklyActiveUsersCount > 50 && input.recurringRevenueUsd < 1000) {
      alerts.push({
        verticalId: input.verticalId,
        anomalyType: "HIGH_USAGE_LOW_REVENUE",
        severity: "MEDIUM",
        description: `Vertical '${input.verticalId}' has strong usage (${input.weeklyActiveUsersCount} WAU) but low revenue ($${input.recurringRevenueUsd}/mo).`,
        recommendation: "Re-evaluate pricing packages, trial limits, or value gating for premium features.",
      });
    }

    // 3. High Retention + High Support Burden (Inefficient Delivery)
    if (input.cohortRetentionPct > 70 && input.supportTicketsPerCustomer > 3) {
      alerts.push({
        verticalId: input.verticalId,
        anomalyType: "HIGH_RETENTION_HIGH_SUPPORT_COST",
        severity: "HIGH",
        description: `Vertical '${input.verticalId}' has strong retention (${input.cohortRetentionPct}%) but high support burden (${input.supportTicketsPerCustomer} tickets/cust).`,
        recommendation: "Improve UX, documentation, and automated self-service to reduce operational delivery cost.",
      });
    }

    // 4. High Revenue + Poor Reliability (Operationally Dangerous Growth)
    if (input.recurringRevenueUsd > 5000 && input.operationalReliabilityPct < 95) {
      alerts.push({
        verticalId: input.verticalId,
        anomalyType: "HIGH_REVENUE_POOR_RELIABILITY",
        severity: "CRITICAL",
        description: `Vertical '${input.verticalId}' generates high revenue ($${input.recurringRevenueUsd}) but suffers low reliability (${input.operationalReliabilityPct}%).`,
        recommendation: "Immediately freeze sales expansion and resolve system stability/sync bugs to prevent massive churn.",
      });
    }

    return alerts;
  }

  /**
   * Classifies unstructured customer feedback into structured roadmap categories.
   */
  public classifyCustomerFeedback(content: string): FeedbackCategory {
    const lower = content.toLowerCase();
    if (lower.includes("crash") || lower.includes("error") || lower.includes("bug") || lower.includes("failed")) return "BUG";
    if (lower.includes("slow") || lower.includes("latency") || lower.includes("freeze")) return "PERFORMANCE_ISSUE";
    if (lower.includes("confusing") || lower.includes("hard to use") || lower.includes("ui") || lower.includes("button")) return "UX_PROBLEM";
    if (lower.includes("workflow") || lower.includes("missing step") || lower.includes("cannot complete")) return "MISSING_WORKFLOW";
    if (lower.includes("price") || lower.includes("expensive") || lower.includes("cost") || lower.includes("billing")) return "PRICING_ISSUE";
    if (lower.includes("tax") || lower.includes("compliance") || lower.includes("audit") || lower.includes("regulator")) return "COMPLIANCE_REQUIREMENT";
    if (lower.includes("how to") || lower.includes("guide") || lower.includes("doc")) return "DOCUMENTATION_GAP";
    return "FEATURE_REQUEST";
  }
}

export const globalPmfValidationEngine = new PmfValidationEngine();
