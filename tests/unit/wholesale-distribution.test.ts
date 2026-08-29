import { describe, it, expect } from "vitest";
import { globalWholesaleEngine } from "@kwakopos2/domain";
import { globalWholesaleService } from "../../apps/api/src/services/wholesaleService.js";
import { renderWholesaleCommandCenterDashboard } from "../../apps/web/src/wholesaleCommandCenter.js";
import { runWholesaleCertification } from "../../scripts/certification/wholesale-certification-engine.js";

describe("Advanced Wholesale & Distribution OS Suite", () => {
  it("should convert units deterministically (e.g. 1 Carton = 24 Pieces)", () => {
    const rule = { productId: "PROD-1", fromUnit: "CARTON", toUnit: "PIECE", conversionFactor: 24 };
    const pieces = globalWholesaleEngine.convertUnits(5, rule); // 5 cartons
    expect(pieces).toBe(120);
  });

  it("should evaluate customer available credit correctly (Limit - Exposure - Reserved)", () => {
    const creditAcc = {
      customerId: "CUST-1",
      creditLimitUsd: 10000,
      currentExposureUsd: 6000,
      reservedExposureUsd: 1000,
      availableCreditUsd: 3000,
      isCreditHold: false,
      creditTermsDays: 30,
      paymentRating: "GOOD" as const,
    };

    const eval1 = globalWholesaleEngine.evaluateCustomerCredit(creditAcc, 2500);
    expect(eval1.isApproved).toBe(true);

    const eval2 = globalWholesaleEngine.evaluateCustomerCredit(creditAcc, 4000);
    expect(eval2.isApproved).toBe(false);
    expect(eval2.reason).toContain("exceeds available credit");
  });

  it("should apply Tier Pricing based on volume quantity breaks", () => {
    const tiers = [
      { productId: "P-1", minQuantity: 10, unitPriceUsd: 45 },
      { productId: "P-1", minQuantity: 50, unitPriceUsd: 40 },
    ];

    expect(globalWholesaleEngine.calculateTierPrice(50, 5, tiers)).toBe(50);   // Standard price
    expect(globalWholesaleEngine.calculateTierPrice(50, 20, tiers)).toBe(45);  // Tier 1 price
    expect(globalWholesaleEngine.calculateTierPrice(50, 100, tiers)).toBe(40); // Tier 2 price
  });

  it("should render visual Wholesale Command Center dashboard", () => {
    const html = renderWholesaleCommandCenterDashboard();
    expect(html).toContain("KWAKOPOS WHOLESALE & DISTRIBUTION COMMAND CENTER");
    expect(html).toContain("64-Pillar B2B Distribution");
  });

  it("should pass 64 / 64 wholesale certification pillars", async () => {
    const report = await runWholesaleCertification();
    expect(report.totalPillars).toBe(64);
    expect(report.passedPillars).toBe(64);
    expect(report.overallPassed).toBe(true);
  });
});
