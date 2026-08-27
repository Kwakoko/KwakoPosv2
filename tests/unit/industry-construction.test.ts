import { describe, it, expect } from "vitest";
import { ConstructionEngine } from "@kwakopos2/domain";
import type { ConstructionWorkPackage } from "@kwakopos2/contracts";

describe("Industry Engine: Construction", () => {
  const engine = new ConstructionEngine();

  it("calculates weighted project completion and cost aggregates", () => {
    const workPackages: ConstructionWorkPackage[] = [
      {
        id: "wp-1",
        name: "Foundation & Earthworks",
        budget: 50000000,
        laborCost: 15000000,
        materialsCost: 32000000,
        progressPercent: 100,
        isCompleted: true,
      },
      {
        id: "wp-2",
        name: "Structural Framing",
        budget: 100000000,
        laborCost: 20000000,
        materialsCost: 40000000,
        progressPercent: 50,
        isCompleted: false,
      },
      {
        id: "wp-3",
        name: "Finishes & Electrical",
        budget: 50000000,
        laborCost: 0,
        materialsCost: 0,
        progressPercent: 0,
        isCompleted: false,
      },
    ];

    const summary = engine.calculateProjectSummary(workPackages);

    // Total Budget: 50M + 100M + 50M = 200M
    expect(summary.totalBudget).toBe(200000000);
    // Total Actual: (15M+32M) + (20M+40M) + 0 = 47M + 60M = 107M
    expect(summary.totalActualCost).toBe(107000000);
    // Weighted Progress: (100% * 50M + 50% * 100M + 0% * 50M) / 200M = (50M + 50M) / 200M = 100M / 200M = 50%
    expect(summary.overallProgressPercent).toBe(50);
  });
});
