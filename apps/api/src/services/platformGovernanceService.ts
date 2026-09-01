import {
  ArchitectureDecisionRecord,
  ApiContractGovernanceRule,
  DeprecationRegistryItem,
  ArchitectureFitnessCheckResult,
  PlatformComplexityBudget,
  PlatformGovernanceCommandCenterSummary,
} from "@kwakopos2/contracts";
import { globalPlatformGovernanceEngine } from "@kwakopos2/domain";

export class PlatformGovernanceService {
  public createAdr(proposal: {
    title: string;
    context: string;
    decision: string;
    consequences: string[];
    owner: string;
  }): ArchitectureDecisionRecord {
    return globalPlatformGovernanceEngine.createAdr(proposal);
  }

  public evaluateApiContract(ruleInput: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    version: string;
    ownerDomain: string;
    hasRequestSchema: boolean;
    hasResponseSchema: boolean;
    hasDocumentation: boolean;
    isBreakingChange: boolean;
  }): { rule: ApiContractGovernanceRule; isCompliant: boolean; errorReason?: string } {
    return globalPlatformGovernanceEngine.evaluateApiContract(ruleInput);
  }

  public evaluateFitnessRules(state: {
    hasUnauthorizedRawDbAccess: boolean;
    hasCrossTenantDataPaths: boolean;
    hasUndocumentedPublicApis: boolean;
    hasDuplicateFinancialLedgers: boolean;
    hasDuplicateInventoryBalances: boolean;
    hasUnmanagedSecrets: boolean;
  }): ArchitectureFitnessCheckResult {
    return globalPlatformGovernanceEngine.evaluateFitnessRules(state);
  }

  public registerDeprecation(item: {
    subjectName: string;
    subjectType: "API_ENDPOINT" | "PLUGIN" | "SCHEMA_FIELD" | "SYNC_PROTOCOL" | "FEATURE";
    replacementSubject: string;
    migrationGuideUrl: string;
    owner: string;
  }): DeprecationRegistryItem {
    return globalPlatformGovernanceEngine.registerDeprecation(item);
  }

  public evaluateComplexityBudget(input: {
    proposedServicesCount: number;
    proposedDatabasesCount: number;
    proposedQueuesCount: number;
  }): PlatformComplexityBudget {
    return globalPlatformGovernanceEngine.evaluateComplexityBudget(input);
  }

  public getDashboardMetrics(): PlatformGovernanceCommandCenterSummary {
    return globalPlatformGovernanceEngine.getCommandCenterSummary();
  }

  public getAdrs(): ArchitectureDecisionRecord[] {
    return globalPlatformGovernanceEngine.getAdrs();
  }

  public getDeprecations(): DeprecationRegistryItem[] {
    return globalPlatformGovernanceEngine.getDeprecations();
  }
}

export const globalPlatformGovernanceService = new PlatformGovernanceService();
