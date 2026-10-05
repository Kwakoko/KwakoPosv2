import { describe, it, expect } from "vitest";
import { globalGarageEngine } from "@kwakopos2/domain";
import { globalGarageService } from "../../apps/api/src/services/garageService.js";
import { renderGarageCommandCenterDashboard } from "../../apps/web/src/garageCommandCenter.js";
import { runGarageCertification } from "../../scripts/certification/garage-certification-engine.js";

describe("Advanced Garage & Automotive Workshop OS Suite", () => {
  it("should preserve vehicle UUID and history during ownership transfer", () => {
    const vehicle = globalGarageService.getVehicles()[0];
    const transferred = globalGarageEngine.transferVehicleOwnership(vehicle, "CUST-9999", "T999 NEW");

    expect(transferred.id).toBe(vehicle.id); // Permanent UUID preserved
    expect(transferred.customerId).toBe("CUST-9999");
    expect(transferred.registrationNumber).toBe("T999 NEW");
  });

  it("should detect estimate overruns when actual costs exceed approved threshold", () => {
    const estimate = {
      id: "EST-1",
      jobCardId: "JOB-1",
      versionNumber: 1,
      items: [],
      subtotalPartsUsd: 200,
      subtotalLaborUsd: 100,
      totalTaxUsd: 0,
      totalDiscountUsd: 0,
      grandTotalUsd: 300,
      approvalStatus: "APPROVED" as const,
    };

    expect(globalGarageEngine.isEstimateOverrun(estimate, 310, 10)).toBe(false); // <= $330 allowed
    expect(globalGarageEngine.isEstimateOverrun(estimate, 350, 10)).toBe(true);  // > $330 overrun
  });

  it("should calculate labor cost vs revenue accurately", () => {
    const calc = globalGarageEngine.calculateLaborCostAndRevenue(4, 25, 60); // 4 hours, $25 cost, $60 billing
    expect(calc.laborCostUsd).toBe(100.0);
    expect(calc.laborRevenueUsd).toBe(240.0);
    expect(calc.grossProfitUsd).toBe(140.0);
  });

  it("should render visual Garage Command Center dashboard", () => {
    const html = renderGarageCommandCenterDashboard();
    expect(html).toContain("KWAKOPOS AUTOMOTIVE WORKSHOP COMMAND CENTER");
    expect(html).toContain("Automotive Service");
  });

  it("should pass all garage domain certification checks", async () => {
    const report = await runGarageCertification();
    expect(report.totalChecks).toBeGreaterThan(0);
    expect(report.passedChecks).toBe(report.totalChecks);
    expect(report.overallPassed).toBe(true);
  });
});
