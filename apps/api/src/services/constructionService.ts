import {
  ConstructionProjectMaster,
  ConstructionFinancialSummary,
  EarnedValueMetrics,
} from "@kwakopos2/contracts";
import { globalConstructionEngine } from "@kwakopos2/domain";

export class ConstructionService {
  private projects: ConstructionProjectMaster[] = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      projectNumber: "PRJ-2026-COMM-001",
      projectName: "Commercial Tower Phase 1 Structure",
      clientId: "00000000-0000-0000-0000-000000000001",
      projectManagerId: "00000000-0000-0000-0000-000000000001",
      contractValueUsd: 1250000.0,
      originalBudgetUsd: 950000.0,
      revisedBudgetUsd: 980000.0,
      actualCostUsd: 420000.0,
      committedCostUsd: 680000.0,
      startDate: "2026-01-15",
      targetCompletionDate: "2026-11-30",
      status: "IN_PROGRESS",
      retentionPct: 5.0,
      retentionBalanceUsd: 25000.0,
    },
  ];

  public getProjects(): ConstructionProjectMaster[] {
    return this.projects;
  }

  public getEarnedValue(projectId: string): EarnedValueMetrics {
    const prj = this.projects.find((p) => p.id === projectId) || this.projects[0];
    return globalConstructionEngine.calculateEarnedValue(
      prj.revisedBudgetUsd,
      50.0, // 50% planned progress
      48.0, // 48% actual progress
      prj.actualCostUsd
    );
  }

  public getFinancialSummary(): ConstructionFinancialSummary {
    return {
      totalProjectsCount: this.projects.length,
      totalContractValueUsd: 1250000.0,
      totalActualCostUsd: 420000.0,
      totalCertifiedRevenueUsd: 550000.0,
      totalRetentionHeldUsd: 27500.0,
      grossMarginUsd: 130000.0,
      marginPct: 23.6,
    };
  }
}

export const globalConstructionService = new ConstructionService();
