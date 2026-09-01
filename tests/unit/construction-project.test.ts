import { describe, it, expect } from "vitest";
import { globalConstructionEngine } from "@kwakopos2/domain";
import { globalConstructionService } from "../../apps/api/src/services/constructionService.js";
import { renderConstructionCommandCenterDashboard } from "../../apps/web/src/constructionCommandCenter.js";
import { runConstructionCertification } from "../../scripts/certification/construction-certification-engine.js";

describe("Advanced Construction & Project Management OS Suite", () => {
  it("should calculate Earned Value Management (EVM) metrics accurately", () => {
    const evm = globalConstructionEngine.calculateEarnedValue(
      1000000, // BAC $1M
      50,      // 50% Planned Progress (PV = $500,000)
      48,      // 48% Actual Progress (EV = $480,000)
      420000   // AC = $420,000
    );

    expect(evm.plannedValuePvUsd).toBe(500000);
    expect(evm.earnedValueEvUsd).toBe(480000);
    expect(evm.costVarianceCvUsd).toBe(60000); // $480k - $420k = +$60k under budget
    expect(evm.cpi).toBeCloseTo(1.14, 2); // Under budget
  });

  it("should apply approved Contract Variations to update revised project budget", () => {
    const prj = globalConstructionService.getProjects()[0];
    const variation = {
      id: "VAR-1",
      variationNumber: "VAR-001",
      projectId: prj.id,
      description: "Additional foundation piling",
      costImpactUsd: 50000,
      scheduleImpactDays: 14,
      approvalStatus: "APPROVED" as const,
    };

    const updated = globalConstructionEngine.applyVariationToProject(prj, variation);
    expect(updated.revisedBudgetUsd).toBe(prj.revisedBudgetUsd + 50000);
    expect(updated.contractValueUsd).toBe(prj.contractValueUsd + 50000);
  });

  it("should calculate Interim Payment Certificates with retention deductions", () => {
    const ipc = globalConstructionEngine.generatePaymentCertificate(
      "PRJ-1",
      100000, // $100,000 work
      10000,  // $10,000 variation
      5.0,    // 5% retention
      20000   // $20,000 previous payments
    );

    expect(ipc.grossCertifiedValueUsd).toBe(110000);
    expect(ipc.lessRetentionDeductionUsd).toBe(5500); // 5% of $110,000
    expect(ipc.netBillableAmountUsd).toBe(84500); // $110,000 - $5,500 - $20,000
  });

  it("should render visual Construction Command Center dashboard", () => {
    const html = renderConstructionCommandCenterDashboard();
    expect(html).toContain("KWAKOPOS CONSTRUCTION & PROJECT CONTROLS COMMAND CENTER");
    expect(html).toContain("61-Pillar Construction ERP");
  });

  it("should pass 61 / 61 construction certification pillars", async () => {
    const report = await runConstructionCertification();
    expect(report.totalPillars).toBe(61);
    expect(report.passedPillars).toBe(61);
    expect(report.overallPassed).toBe(true);
  });
});
