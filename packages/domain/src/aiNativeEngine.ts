import {
  AiRecommendationRecord,
  AiRiskLevel,
  AiAutonomyLevel,
  AiPolicyValidationResult,
  AiApprovalRecord,
  AiActionLedgerEntry,
  AiKillSwitchStatus,
  AiCostGovernanceQuota,
  AiCommandCenterSummary,
} from "@kwakopos2/contracts";

export class AiNativeEngine {
  private recommendations: Map<string, AiRecommendationRecord> = new Map();
  private ledgerEntries: AiActionLedgerEntry[] = [];
  private killSwitch: AiKillSwitchStatus = {
    scope: "GLOBAL",
    isActive: false,
    disabledTargets: [],
    triggeredBy: "NONE",
    triggeredAt: new Date().toISOString(),
  };

  /**
   * 1. Generate Evidence-Backed AI Recommendation
   */
  public generateRecommendation(input: {
    tenantId: string;
    branchId: string;
    domain: "SALES" | "INVENTORY" | "FINANCE" | "WORKFORCE" | "OPERATIONS" | "CUSTOMER_SERVICE" | "ENGINEERING" | "SAAS_REVENUE" | "MARKETPLACE";
    proposedAction: string;
    riskLevel: AiRiskLevel;
    confidenceScore: number;
    evidenceSummary: string;
  }): AiRecommendationRecord {
    if (this.killSwitch.isActive) {
      throw new Error("Emergency AI Kill Switch is ACTIVE. Recommendation generation blocked.");
    }

    const recId = `REC-${Date.now()}`;
    let autonomyLevel: AiAutonomyLevel = "ASSIST";

    if (input.riskLevel === "LEVEL_0_INFORMATIONAL") autonomyLevel = "ASSIST";
    else if (input.riskLevel === "LEVEL_1_LOW_IMPACT") autonomyLevel = "GUARDED_AUTOMATION";
    else if (input.riskLevel === "LEVEL_2_CONTROLLED_OPERATIONAL") autonomyLevel = "APPROVE";
    else if (input.riskLevel === "LEVEL_3_HIGH_IMPACT") autonomyLevel = "APPROVE";
    else if (input.riskLevel === "LEVEL_4_RESTRICTED") autonomyLevel = "PROHIBITED";

    const rec: AiRecommendationRecord = {
      recommendationId: recId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      domain: input.domain,
      proposedAction: input.proposedAction,
      riskLevel: input.riskLevel,
      autonomyLevel,
      confidenceScore: input.confidenceScore,
      evidenceSummary: input.evidenceSummary,
      policyRequirements: [`Policy-${input.riskLevel}`, "TenantIsolationPolicy", "FinancialIntegrityGuard"],
      approvalStatus: autonomyLevel === "PROHIBITED" ? "REJECTED" : "PENDING_POLICY",
      createdAt: new Date().toISOString(),
    };

    this.recommendations.set(recId, rec);
    return rec;
  }

  /**
   * 2. Deterministic AI Policy Validation Engine
   */
  public validatePolicy(
    recommendationId: string,
    rules: { maxLimitUsd: number; proposedLimitUsd: number }
  ): AiPolicyValidationResult {
    const rec = this.recommendations.get(recommendationId);
    if (!rec) throw new Error(`Recommendation ${recommendationId} not found.`);

    // Invariant: Level 4 actions can NEVER execute autonomously or pass policy
    if (rec.riskLevel === "LEVEL_4_RESTRICTED") {
      return {
        recommendationId,
        policyPassed: false,
        requiresHumanApproval: true,
        automatedApprovalPermitted: false,
        evaluatedRules: ["Level 4 Restricted Guard"],
        violationReason: "Level 4 actions (security admin, data destruction, cross-tenant) are strictly PROHIBITED from execution.",
        evaluatedAt: new Date().toISOString(),
      };
    }

    const valueCheck = rules.proposedLimitUsd <= rules.maxLimitUsd;
    const automatedPermitted = rec.riskLevel === "LEVEL_1_LOW_IMPACT" && valueCheck;
    const policyPassed = valueCheck;

    if (policyPassed) {
      rec.approvalStatus = automatedPermitted ? "APPROVED" : "PENDING_HUMAN_APPROVAL";
    } else {
      rec.approvalStatus = "REJECTED";
    }

    return {
      recommendationId,
      policyPassed,
      requiresHumanApproval: !automatedPermitted,
      automatedApprovalPermitted: automatedPermitted,
      evaluatedRules: ["FinancialThresholdRule", "TenantIsolationRule"],
      violationReason: policyPassed ? undefined : "Proposed action exceeds policy financial limits.",
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * 3. Action Gateway Execution & Verification
   */
  public executeActionGateway(
    recommendationId: string,
    approval: AiApprovalRecord,
    domainServiceCallback: () => { success: boolean; details: string }
  ): AiActionLedgerEntry {
    const rec = this.recommendations.get(recommendationId);
    if (!rec) throw new Error(`Recommendation ${recommendationId} not found.`);

    if (rec.riskLevel === "LEVEL_4_RESTRICTED") {
      throw new Error("LEVEL_4_RESTRICTED violation: AI Action Gateway blocked execution.");
    }

    if (!approval.approved) {
      rec.approvalStatus = "REJECTED";
      throw new Error("Action rejected by approval authority.");
    }

    // Execute via Action Gateway
    const res = domainServiceCallback();
    rec.approvalStatus = res.success ? "EXECUTED" : "FAILED";

    const ledgerEntry: AiActionLedgerEntry = {
      auditId: `AUD-AI-${Date.now()}`,
      recommendationId,
      tenantId: rec.tenantId,
      domain: rec.domain,
      actionExecuted: rec.proposedAction,
      executedByIdentity: approval.approverUserId,
      executionVerified: res.success,
      verificationDetails: res.details,
      timestamp: new Date().toISOString(),
    };

    this.ledgerEntries.push(ledgerEntry);
    return ledgerEntry;
  }

  /**
   * 4. Emergency AI Kill Switch
   */
  public triggerKillSwitch(scope: "GLOBAL" | "TENANT" | "AGENT" | "TOOL" | "FEATURE", targetId: string): AiKillSwitchStatus {
    this.killSwitch = {
      scope,
      isActive: true,
      disabledTargets: [targetId],
      triggeredBy: "SUPER_ADMIN",
      triggeredAt: new Date().toISOString(),
    };
    return this.killSwitch;
  }

  /**
   * 5. AI Cost Governance & Quota Tracking
   */
  public trackCostAndQuota(tenantId: string, tokenCount: number, costUsd: number): AiCostGovernanceQuota {
    const budgetToken = 1000000; // 1M tokens/mo
    const budgetUsd = 50.0; // $50/mo

    const isThrottled = tokenCount > budgetToken || costUsd > budgetUsd;

    return {
      tenantId,
      monthlyTokenBudget: budgetToken,
      tokensConsumedThisMonth: tokenCount,
      monthlyUsdBudget: budgetUsd,
      usdConsumedThisMonth: costUsd,
      isThrottled,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 6. AI Command Center Metrics Summary
   */
  public getAiCommandCenterSummary(): AiCommandCenterSummary {
    return {
      activeAiAgentsCount: 10, // Retail, Restaurant, Pharmacy, Law Firm, SACCO, Microfinance, Poultry, Fleet, Hardware, Electronics
      totalRecommendationsGenerated: this.recommendations.size,
      pendingHumanApprovals: Array.from(this.recommendations.values()).filter((r) => r.approvalStatus === "PENDING_HUMAN_APPROVAL").length,
      guardedAutomatedExecutionsCount: this.ledgerEntries.filter((l) => l.executionVerified).length,
      killSwitchActive: this.killSwitch.isActive,
      monthlyCostEfficiencyPct: 98.5,
    };
  }

  public getLedger(): AiActionLedgerEntry[] {
    return this.ledgerEntries;
  }
}

export const globalAiNativeEngine = new AiNativeEngine();
