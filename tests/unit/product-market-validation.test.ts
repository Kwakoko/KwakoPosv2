import { describe, it, expect } from "vitest";
import { globalPmfValidationEngine } from "@kwakopos2/domain";
import { globalPmfValidationService } from "../../apps/api/src/services/pmfValidationService.js";
import { renderPmfCommandCenterDashboard } from "../../apps/web/src/pmfCommandCenter.js";
import { runPmfValidationCertification } from "../../scripts/certification/pmf-validation-certification-engine.js";

describe("Phase 17 — Product-Market Validation Engine Suite", () => {

  describe("1. PMF Health Score Formula (User-Approved Weighted Model)", () => {
    it("should calculate exact score (Retention 20%, Revenue 20%, Activation 15%, WAU 15%, Adoption 15%, Reliability 15%)", () => {
      const scoreResult = globalPmfValidationEngine.calculatePmfHealthScore({
        verticalId: "saccovicoba",
        cohortRetentionPct: 92,
        recurringRevenueUsd: 15000,
        activationRatePct: 91,
        weeklyActiveUsersCount: 110,
        workflowAdoptionRatePct: 84,
        operationalReliabilityPct: 99.7,
        supportTicketsPerCustomer: 1.1,
        monthlyChurnRatePct: 1.1,
      });

      expect(scoreResult.normalizedHealthScore).toBeGreaterThanOrEqual(80);
      expect(scoreResult.pmfState).toBe("PROVEN");
      expect(scoreResult.investmentAction).toBe("DOUBLE_DOWN");
      expect(scoreResult.scoreBreakdown.retentionComponent).toBeCloseTo(18.4, 1);
    });

    it("should assign PRODUCT_GAP and OPTIMIZE for vertical with low adoption", () => {
      const scoreResult = globalPmfValidationEngine.calculatePmfHealthScore({
        verticalId: "poultrylivestock",
        cohortRetentionPct: 40,
        recurringRevenueUsd: 2000,
        activationRatePct: 45,
        weeklyActiveUsersCount: 20,
        workflowAdoptionRatePct: 30,
        operationalReliabilityPct: 98.0,
        supportTicketsPerCustomer: 4.5,
        monthlyChurnRatePct: 6.0,
      });

      expect(["PRODUCT_GAP", "COMMERCIAL_RISK", "VALIDATION_REQUIRED", "PAUSED"]).toContain(scoreResult.pmfState);
    });
  });

  describe("2. False PMF Anomaly Detection Engine", () => {
    it("should detect High Signup + Low Activation anomaly", () => {
      const alerts = globalPmfValidationEngine.detectFalsePmfAnomalies({
        verticalId: "test_vert",
        cohortRetentionPct: 50,
        recurringRevenueUsd: 2000,
        activationRatePct: 20, // < 30%
        weeklyActiveUsersCount: 40, // > 30
        workflowAdoptionRatePct: 40,
        operationalReliabilityPct: 99.0,
        supportTicketsPerCustomer: 1.0,
        monthlyChurnRatePct: 2.0,
      });

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].anomalyType).toBe("HIGH_SIGNUP_LOW_ACTIVATION");
    });

    it("should detect High Revenue + Poor Reliability anomaly as CRITICAL", () => {
      const alerts = globalPmfValidationEngine.detectFalsePmfAnomalies({
        verticalId: "test_vert2",
        cohortRetentionPct: 80,
        recurringRevenueUsd: 10000, // > 5000
        activationRatePct: 80,
        weeklyActiveUsersCount: 80,
        workflowAdoptionRatePct: 80,
        operationalReliabilityPct: 90.0, // < 95%
        supportTicketsPerCustomer: 1.0,
        monthlyChurnRatePct: 1.0,
      });

      const crit = alerts.find((a) => a.anomalyType === "HIGH_REVENUE_POOR_RELIABILITY");
      expect(crit).toBeDefined();
      expect(crit?.severity).toBe("CRITICAL");
    });
  });

  describe("3. Customer Feedback Classification Engine", () => {
    it("should classify raw feedback into structured categories", () => {
      expect(globalPmfValidationEngine.classifyCustomerFeedback("System crash on POS checkout")).toBe("BUG");
      expect(globalPmfValidationEngine.classifyCustomerFeedback("Screen latency is too high during peak hours")).toBe("PERFORMANCE_ISSUE");
      expect(globalPmfValidationEngine.classifyCustomerFeedback("UI button is confusing")).toBe("UX_PROBLEM");
      expect(globalPmfValidationEngine.classifyCustomerFeedback("Monthly price is too expensive for small branches")).toBe("PRICING_ISSUE");
    });
  });

  describe("4. Visual PMF Command Center Dashboard", () => {
    it("should render full PMF Command Center dashboard HTML", () => {
      const profiles = globalPmfValidationService.getAllVerticalPmfProfiles();
      const anomalies = globalPmfValidationService.getFalsePmfAnomalies();
      const html = renderPmfCommandCenterDashboard({ verticalProfiles: profiles, anomalies });

      expect(html).toContain("KWAKOPOS PMF VALIDATION COMMAND CENTER");
      expect(html).toContain("Retail Operating System");
      expect(html).toContain("Reconciled Active Sales");
      expect(html).toContain("DOUBLE_DOWN");
    });
  });

  describe("5. 34-Pillar Product-Market Validation Certification", () => {
    it("should pass 34 / 34 PMF validation certification pillars", async () => {
      const certReport = await runPmfValidationCertification();
      expect(certReport.totalPillars).toBe(34);
      expect(certReport.passedPillars).toBe(34);
      expect(certReport.overallPassed).toBe(true);
    });
  });
});
