import type {
  ConstructionProject,
  ConstructionWorkPackage,
} from "@kwakopos2/contracts";

export class ConstructionEngine {
  calculateProjectSummary(packages: ConstructionWorkPackage[]): {
    totalBudget: number;
    totalActualCost: number;
    overallProgressPercent: number;
  } {
    if (packages.length === 0) {
      return { totalBudget: 0, totalActualCost: 0, overallProgressPercent: 0 };
    }

    let totalBudget = 0;
    let totalActualCost = 0;
    let weightedProgressSum = 0;

    for (const pkg of packages) {
      totalBudget += pkg.budget;
      const actualCost = pkg.laborCost + pkg.materialsCost;
      totalActualCost += actualCost;
      weightedProgressSum += (pkg.progressPercent * pkg.budget);
    }

    const overallProgressPercent =
      totalBudget > 0 ? Math.round(weightedProgressSum / totalBudget) : 0;

    return {
      totalBudget,
      totalActualCost,
      overallProgressPercent,
    };
  }
}
