import {
  AiRecommendationRecord,
  AiRiskLevel,
  AiPolicyValidationResult,
  AiApprovalRecord,
  AiActionLedgerEntry,
  AiKillSwitchStatus,
  AiCommandCenterSummary,
} from "@kwakopos2/contracts";
import { globalAiNativeEngine } from "@kwakopos2/domain";

export class AiNativeService {
  public requestRecommendation(input: {
    tenantId: string;
    branchId: string;
    domain: "SALES" | "INVENTORY" | "FINANCE" | "WORKFORCE" | "OPERATIONS" | "CUSTOMER_SERVICE" | "ENGINEERING" | "SAAS_REVENUE" | "MARKETPLACE";
    proposedAction: string;
    riskLevel: AiRiskLevel;
    confidenceScore: number;
    evidenceSummary: string;
  }): AiRecommendationRecord {
    return globalAiNativeEngine.generateRecommendation(input);
  }

  public validatePolicy(recommendationId: string, rules: { maxLimitUsd: number; proposedLimitUsd: number }, tenantId?: string): AiPolicyValidationResult {
    return globalAiNativeEngine.validatePolicy(recommendationId, rules, tenantId);
  }

  public executeAction(
    recommendationId: string,
    approval: AiApprovalRecord,
    domainCallback: () => { success: boolean; details: string }
  ): AiActionLedgerEntry {
    return globalAiNativeEngine.executeActionGateway(recommendationId, approval, domainCallback);
  }

  public triggerKillSwitch(scope: "GLOBAL" | "TENANT" | "AGENT" | "TOOL" | "FEATURE", targetId: string): AiKillSwitchStatus {
    return globalAiNativeEngine.triggerKillSwitch(scope, targetId);
  }

  public getDashboardMetrics(): AiCommandCenterSummary {
    return globalAiNativeEngine.getAiCommandCenterSummary();
  }

  public getLedger(tenantId?: string): AiActionLedgerEntry[] {
    return globalAiNativeEngine.getLedger(tenantId);
  }
}

export const globalAiNativeService = new AiNativeService();
