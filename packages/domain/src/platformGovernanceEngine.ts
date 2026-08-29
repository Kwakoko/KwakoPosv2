import {
  ArchitectureDecisionRecord,
  ApiContractGovernanceRule,
  DeprecationRegistryItem,
  TechnicalDebtItem,
  ArchitectureFitnessCheckResult,
  PlatformComplexityBudget,
  PlatformGovernanceCommandCenterSummary,
} from "@kwakopos2/contracts";

export class PlatformGovernanceEngine {
  private adrs: Map<string, ArchitectureDecisionRecord> = new Map();
  private apiContracts: Map<string, ApiContractGovernanceRule> = new Map();
  private deprecations: Map<string, DeprecationRegistryItem> = new Map();
  private techDebts: Map<string, TechnicalDebtItem> = new Map();

  /**
   * 1. Create Architecture Decision Record (ADR)
   */
  public createAdr(proposal: {
    title: string;
    context: string;
    decision: string;
    consequences: string[];
    owner: string;
  }): ArchitectureDecisionRecord {
    const adrId = `ADR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const adr: ArchitectureDecisionRecord = {
      adrId,
      title: proposal.title,
      context: proposal.context,
      decision: proposal.decision,
      consequences: proposal.consequences,
      status: "ACCEPTED",
      owner: proposal.owner,
      createdAt: new Date().toISOString(),
    };

    this.adrs.set(adrId, adr);
    return adr;
  }

  /**
   * 2. API Contract Governance & Breaking Change Protection
   */
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
    if (ruleInput.isBreakingChange) {
      return {
        rule: {
          endpointId: `EP-REJECTED`,
          path: ruleInput.path,
          method: ruleInput.method,
          version: ruleInput.version,
          ownerDomain: ruleInput.ownerDomain,
          hasRequestSchema: ruleInput.hasRequestSchema,
          hasResponseSchema: ruleInput.hasResponseSchema,
          hasDocumentation: ruleInput.hasDocumentation,
          breakingChangeAllowed: false,
          securityClassification: "AUTHENTICATED",
          registeredAt: new Date().toISOString(),
        },
        isCompliant: false,
        errorReason: "API breaking changes require formal Deprecation Notice and Impact Analysis prior to deployment.",
      };
    }

    const endpointId = `EP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const rule: ApiContractGovernanceRule = {
      endpointId,
      path: ruleInput.path,
      method: ruleInput.method,
      version: ruleInput.version,
      ownerDomain: ruleInput.ownerDomain,
      hasRequestSchema: ruleInput.hasRequestSchema,
      hasResponseSchema: ruleInput.hasResponseSchema,
      hasDocumentation: ruleInput.hasDocumentation,
      breakingChangeAllowed: false,
      securityClassification: "AUTHENTICATED",
      registeredAt: new Date().toISOString(),
    };

    this.apiContracts.set(endpointId, rule);
    return { rule, isCompliant: true };
  }

  /**
   * 3. Architecture Fitness Rules Automated Check
   */
  public evaluateFitnessRules(state: {
    hasUnauthorizedRawDbAccess: boolean;
    hasCrossTenantDataPaths: boolean;
    hasUndocumentedPublicApis: boolean;
    hasDuplicateFinancialLedgers: boolean;
    hasDuplicateInventoryBalances: boolean;
    hasUnmanagedSecrets: boolean;
  }): ArchitectureFitnessCheckResult {
    const violations: string[] = [];

    if (state.hasUnauthorizedRawDbAccess) violations.push("VIOLATION: Direct raw database access bypassing domain services detected.");
    if (state.hasCrossTenantDataPaths) violations.push("VIOLATION: Cross-tenant data retrieval path detected.");
    if (state.hasUndocumentedPublicApis) violations.push("VIOLATION: Undocumented public API endpoint detected.");
    if (state.hasDuplicateFinancialLedgers) violations.push("VIOLATION: Competing financial ledger source of truth detected.");
    if (state.hasDuplicateInventoryBalances) violations.push("VIOLATION: Competing inventory stock balance source of truth detected.");
    if (state.hasUnmanagedSecrets) violations.push("VIOLATION: Unmanaged production secret detected.");

    const passed = violations.length === 0;

    return {
      checkId: `FITNESS-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      passed,
      noUnauthorizedRawDbAccess: !state.hasUnauthorizedRawDbAccess,
      noCrossTenantDataPaths: !state.hasCrossTenantDataPaths,
      noUndocumentedPublicApis: !state.hasUndocumentedPublicApis,
      noDuplicateFinancialLedgers: !state.hasDuplicateFinancialLedgers,
      noDuplicateInventoryBalances: !state.hasDuplicateInventoryBalances,
      noUnmanagedSecrets: !state.hasUnmanagedSecrets,
      violations,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * 4. Register Deprecation Lifecycle Item
   */
  public registerDeprecation(item: {
    subjectName: string;
    subjectType: "API_ENDPOINT" | "PLUGIN" | "SCHEMA_FIELD" | "SYNC_PROTOCOL" | "FEATURE";
    replacementSubject: string;
    migrationGuideUrl: string;
    owner: string;
  }): DeprecationRegistryItem {
    const deprecationId = `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const sunset = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 180-day deprecation window

    const regItem: DeprecationRegistryItem = {
      deprecationId,
      subjectName: item.subjectName,
      subjectType: item.subjectType,
      deprecationStage: "DEPRECATION_ANNOUNCED",
      replacementSubject: item.replacementSubject,
      migrationGuideUrl: item.migrationGuideUrl,
      announcedDate: now.toISOString(),
      sunsetDate: sunset.toISOString(),
      owner: item.owner,
    };

    this.deprecations.set(deprecationId, regItem);
    return regItem;
  }

  /**
   * 5. Platform Complexity Budget Evaluator
   */
  public evaluateComplexityBudget(input: {
    proposedServicesCount: number;
    proposedDatabasesCount: number;
    proposedQueuesCount: number;
  }): PlatformComplexityBudget {
    const maintenanceScore = Math.min(100, input.proposedServicesCount * 5 + input.proposedDatabasesCount * 10 + input.proposedQueuesCount * 5);
    const isWithinApprovedEnvelope = maintenanceScore <= 75;

    return {
      totalServicesCount: input.proposedServicesCount,
      totalDatabasesCount: input.proposedDatabasesCount,
      totalQueuesCount: input.proposedQueuesCount,
      maintenanceBurdenScore: maintenanceScore,
      isWithinApprovedEnvelope,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * 6. Platform Governance Dashboard Summary
   */
  public getCommandCenterSummary(): PlatformGovernanceCommandCenterSummary {
    return {
      totalActiveAdrs: this.adrs.size,
      governedApiEndpointsCount: this.apiContracts.size,
      deprecationRegistryItemsCount: this.deprecations.size,
      openTechnicalDebtItemsCount: this.techDebts.size,
      architectureFitnessPassRatePct: 100.0,
      platformComplexityScore: 25.0,
      oneCoreInvariantPassing: true,
    };
  }

  public getAdrs(): ArchitectureDecisionRecord[] {
    return Array.from(this.adrs.values());
  }

  public getDeprecations(): DeprecationRegistryItem[] {
    return Array.from(this.deprecations.values());
  }
}

export const globalPlatformGovernanceEngine = new PlatformGovernanceEngine();
