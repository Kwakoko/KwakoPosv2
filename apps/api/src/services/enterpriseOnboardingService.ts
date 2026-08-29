import {
  EnterpriseImplementationProject,
  DiscoveryProfile,
  SolutionBlueprint,
  DataReadinessScorecard,
  MigrationReconciliationReport,
  IntegrationCertificationRecord,
  GoLiveReadinessGate,
  ImplementationHealthScore,
  IndustryOnboardingKit,
} from "@kwakopos2/contracts";
import { globalEnterpriseOnboardingEngine } from "@kwakopos2/domain";

export class EnterpriseOnboardingService {
  private projects: Map<string, EnterpriseImplementationProject> = new Map();

  public createProject(input: {
    tenantId: string;
    customerName: string;
    industryId: string;
  }): EnterpriseImplementationProject {
    const projectId = `PROJ-${Date.now()}`;
    const project: EnterpriseImplementationProject = {
      projectId,
      tenantId: input.tenantId,
      customerName: input.customerName,
      industryId: input.industryId,
      currentStage: "SALES_HANDOFF",
      integrationCertificationRecords: [],
      roleTrainingProgress: [],
      riskRegister: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    project.healthScore = globalEnterpriseOnboardingEngine.calculateImplementationHealthScore(project);
    this.projects.set(projectId, project);
    return project;
  }

  public getProject(projectId: string): EnterpriseImplementationProject | undefined {
    return this.projects.get(projectId);
  }

  public submitDiscoveryProfile(
    projectId: string,
    profile: DiscoveryProfile
  ): { project: EnterpriseImplementationProject; blueprint: SolutionBlueprint } {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found.`);

    project.discoveryProfile = profile;
    project.currentStage = "DISCOVERY";

    // Auto-generate Solution Blueprint from Discovery Profile
    const blueprint: SolutionBlueprint = {
      blueprintId: `BLUE-${Date.now()}`,
      projectName: `${project.customerName} KwakoPos Solution Blueprint`,
      customerName: project.customerName,
      industry: profile.industry,
      enabledModules: ["Core POS", "Inventory", "Finance", "Stock Ledger", project.industryId],
      selectedIndustryModule: project.industryId,
      branchScope: Array.from({ length: profile.branchCount }, (_, i) => `Branch-${i + 1}`),
      userRoleMatrix: [
        { roleName: "Executive Administrator", assignedUserCount: 2, permissions: ["*"] },
        { roleName: "Branch Storekeeper", assignedUserCount: profile.branchCount * 2, permissions: ["INVENTORY_ADJUST", "INVENTORY_VIEW"] },
        { roleName: "POS Cashier", assignedUserCount: profile.userCount, permissions: ["POS_SALE", "SHIFT_CLOSE"] },
      ],
      dataMigrationScope: ["Products", "Opening Inventory Balances", "Customers", "Suppliers"],
      integrationsConfigured: profile.integrationsRequired,
      goLiveStrategy: profile.branchCount > 5 ? "PHASED" : "BIG_BANG",
      rollbackStrategy: "Database snapshot restore + POS offline queue drain",
      approvedByCustomer: true,
      approvalDate: new Date().toISOString(),
    };

    project.solutionBlueprint = blueprint;
    project.currentStage = "SOLUTION_DESIGN";
    project.updatedAt = new Date().toISOString();
    project.healthScore = globalEnterpriseOnboardingEngine.calculateImplementationHealthScore(project);

    return { project, blueprint };
  }

  public assessDataReadiness(
    projectId: string,
    inputData: {
      totalSourceRows: number;
      validRows: number;
      duplicateRows: number;
      invalidIdentifierRows: number;
      inconsistentUomRows: number;
    }
  ): DataReadinessScorecard {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found.`);

    const scorecard = globalEnterpriseOnboardingEngine.calculateDataReadinessScore(inputData);
    project.dataReadinessScorecard = scorecard;

    if (scorecard.classification !== "MIGRATION_BLOCKED") {
      project.currentStage = "CONFIGURATION";
    }

    project.updatedAt = new Date().toISOString();
    project.healthScore = globalEnterpriseOnboardingEngine.calculateImplementationHealthScore(project);

    return scorecard;
  }

  public reconcileMigration(
    projectId: string,
    source: { rowCount: number; inventoryValueUsd: number; openingBalanceUsd: number },
    target: { rowCount: number; inventoryValueUsd: number; openingBalanceUsd: number }
  ): MigrationReconciliationReport {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found.`);

    const report = globalEnterpriseOnboardingEngine.reconcileMigrationData(source, target);
    project.migrationReconciliationReport = report;

    if (report.reconciliationStatus !== "RECONCILIATION_FAILED") {
      project.currentStage = "DATA_MIGRATION";
    }

    project.updatedAt = new Date().toISOString();
    project.healthScore = globalEnterpriseOnboardingEngine.calculateImplementationHealthScore(project);

    return report;
  }

  public certifyIntegration(
    projectId: string,
    integrationName: string,
    targetSystem: string
  ): IntegrationCertificationRecord {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found.`);

    const cert = globalEnterpriseOnboardingEngine.certifyIntegration(integrationName, targetSystem);
    project.integrationCertificationRecords.push(cert);

    if (project.integrationCertificationRecords.every((i) => i.all10TestsPassed)) {
      project.currentStage = "INTEGRATION";
    }

    project.updatedAt = new Date().toISOString();
    project.healthScore = globalEnterpriseOnboardingEngine.calculateImplementationHealthScore(project);

    return cert;
  }

  public evaluateGoLiveGate(
    projectId: string,
    checklist: {
      criticalWorkflowsComplete: boolean;
      dataMigrationReconciled: boolean;
      integrationsCertified: boolean;
      usersTrained: boolean;
      securityAccessValidated: boolean;
      productionReliabilityConfirmed: boolean;
      supportCoverageActive: boolean;
      rollbackPlanDocumented: boolean;
      customerExecutiveApproval: boolean;
      kwakoPosLeadSignoff: boolean;
    }
  ): GoLiveReadinessGate {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found.`);

    const gate = globalEnterpriseOnboardingEngine.evaluateGoLiveReadiness(checklist);
    project.goLiveReadinessGate = gate;

    if (gate.readyForGoLive) {
      project.currentStage = "GO_LIVE_READINESS";
    }

    project.updatedAt = new Date().toISOString();
    project.healthScore = globalEnterpriseOnboardingEngine.calculateImplementationHealthScore(project);

    return gate;
  }

  public getIndustryOnboardingKit(industryId: string): IndustryOnboardingKit {
    return globalEnterpriseOnboardingEngine.getIndustryOnboardingKit(industryId);
  }
}

export const globalEnterpriseOnboardingService = new EnterpriseOnboardingService();
