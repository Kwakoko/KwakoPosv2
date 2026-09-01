import {
  BoqItemRecord,
  ConstructionProjectMaster,
  ProjectVariationRequest,
  InterimPaymentCertificate,
  EarnedValueMetrics,
  ConstructionFinancialSummary,
} from "@kwakopos2/contracts";

export class ConstructionEngine {
  /**
   * Calculates Earned Value Management (EVM) metrics:
   * PV (Planned Value), EV (Earned Value), AC (Actual Cost), CV = EV - AC, SV = EV - PV, CPI = EV / AC, SPI = EV / PV, EAC = BAC / CPI
   */
  public calculateEarnedValue(
    budgetAtCompletionBacUsd: number,
    plannedProgressPct: number,
    actualProgressPct: number,
    actualCostAcUsd: number
  ): EarnedValueMetrics {
    const plannedValuePvUsd = Math.round((budgetAtCompletionBacUsd * (plannedProgressPct / 100)) * 100) / 100;
    const earnedValueEvUsd = Math.round((budgetAtCompletionBacUsd * (actualProgressPct / 100)) * 100) / 100;
    const costVarianceCvUsd = Math.round((earnedValueEvUsd - actualCostAcUsd) * 100) / 100;
    const scheduleVarianceSvUsd = Math.round((earnedValueEvUsd - plannedValuePvUsd) * 100) / 100;

    const cpi = actualCostAcUsd > 0 ? Math.round((earnedValueEvUsd / actualCostAcUsd) * 100) / 100 : 1.0;
    const spi = plannedValuePvUsd > 0 ? Math.round((earnedValueEvUsd / plannedValuePvUsd) * 100) / 100 : 1.0;
    const forecastFinalCostEacUsd = cpi > 0 ? Math.round((budgetAtCompletionBacUsd / cpi) * 100) / 100 : budgetAtCompletionBacUsd;

    return {
      projectId: "00000000-0000-0000-0000-000000000001",
      plannedValuePvUsd,
      earnedValueEvUsd,
      actualCostAcUsd,
      costVarianceCvUsd,
      scheduleVarianceSvUsd,
      cpi,
      spi,
      forecastFinalCostEacUsd,
    };
  }

  /**
   * Applies approved Contract Variation to update Revised Project Budget & Contract Value.
   */
  public applyVariationToProject(
    project: ConstructionProjectMaster,
    variation: ProjectVariationRequest
  ): ConstructionProjectMaster {
    if (variation.approvalStatus !== "APPROVED") {
      throw new Error("Cannot apply unapproved variation to project budget.");
    }

    return {
      ...project,
      revisedBudgetUsd: project.revisedBudgetUsd + variation.costImpactUsd,
      contractValueUsd: project.contractValueUsd + variation.costImpactUsd,
    };
  }

  /**
   * Calculates Interim Payment Certificate billing with Retention deduction:
   * Net Billable Amount = Gross Certified Value - Retention Deduction - Previous Payments
   */
  public generatePaymentCertificate(
    projectId: string,
    measuredWorkValueUsd: number,
    approvedVariationsValueUsd: number,
    retentionPct: number,
    previousPaymentsUsd: number
  ): InterimPaymentCertificate {
    const grossCertifiedValueUsd = Math.round((measuredWorkValueUsd + approvedVariationsValueUsd) * 100) / 100;
    const lessRetentionDeductionUsd = Math.round((grossCertifiedValueUsd * (retentionPct / 100)) * 100) / 100;
    const netBillableAmountUsd = Math.round((grossCertifiedValueUsd - lessRetentionDeductionUsd - previousPaymentsUsd) * 100) / 100;

    return {
      id: "00000000-0000-0000-0000-000000000001",
      certificateNumber: `IPC-${Date.now().toString().slice(-6)}`,
      projectId,
      measuredWorkValueUsd,
      approvedVariationsValueUsd,
      grossCertifiedValueUsd,
      lessRetentionDeductionUsd,
      lessPreviousPaymentsUsd: previousPaymentsUsd,
      netBillableAmountUsd,
      certifiedAt: new Date().toISOString(),
      status: "CERTIFIED",
    };
  }
  /**
   * Calculates overall project budget, actual cost, and weighted completion percentage.
   */
  public calculateProjectSummary(workPackages: any[]): {
    totalBudget: number;
    totalActualCost: number;
    overallProgressPercent: number;
  } {
    let totalBudget = 0;
    let totalActualCost = 0;
    let weightedProgressSum = 0;

    for (const wp of workPackages) {
      const budget = wp.budget || 0;
      const actual = (wp.laborCost || 0) + (wp.materialsCost || 0);
      const progress = wp.progressPercent || 0;

      totalBudget += budget;
      totalActualCost += actual;
      weightedProgressSum += (progress / 100) * budget;
    }

    const overallProgressPercent = totalBudget > 0 ? Math.round((weightedProgressSum / totalBudget) * 100) : 0;

    return {
      totalBudget,
      totalActualCost,
      overallProgressPercent,
    };
  }
}

export const globalConstructionEngine = new ConstructionEngine();
